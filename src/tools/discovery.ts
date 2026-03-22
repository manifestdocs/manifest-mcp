/**
 * Discovery tools — orient, find, and inspect features.
 */

import type { ManifestClient } from '../client.js';
import { ApiError, ConflictError, ConnectionError, NotFoundError } from '../client.js';
import type {
  FeatureListItem,
  FeatureWithContext,
  InProgressFeatureItem,
  InProgressFeatureResponse,
  ProjectLookupResult,
  Project,
  ProjectHistoryEntry,
} from '../types.js';
import { renderTree, filterTree, stateSymbol, markdownTable, lodBreadcrumb, renderFeatureCard, featureWebUrl } from '../format.js';

// ============================================================
// list_projects
// ============================================================

interface ListProjectsParams {
  directory_path?: string;
}

export async function handleListProjects(
  client: ManifestClient,
  params: ListProjectsParams,
): Promise<string> {
  try {
    if (params.directory_path) {
      const project = resolveProject(await client.listProjectsByDirectory(params.directory_path));
      if (!project) return 'No projects found.';
      return formatProjectSummary(project);
    }
    const projects = await client.listProjects();
    if (projects.length === 0) return 'No projects found.';
    if (projects.length === 1) return formatProjectSummary(projects[0]);
    const rows = projects.map((p) => [p.id, p.name, p.description ?? '']);
    return markdownTable(['ID', 'Name', 'Description'], rows);
  } catch (err) {
    return handleError(err);
  }
}

function formatProjectSummary(project: Project): string {
  const parts: string[] = [];
  parts.push(`Project: ${project.name}`);
  parts.push(`ID: ${project.id}`);
  if (project.description) parts.push(`Description: ${project.description}`);
  if (project.key_prefix) parts.push(`Key prefix: ${project.key_prefix}`);
  return parts.join('\n');
}

// ============================================================
// find_features
// ============================================================

interface FindFeaturesParams {
  project_id?: string;
  version_id?: string;
  state?: string;
  query?: string;
  search_mode?: string;
  limit?: number;
  offset?: number;
}

const DEFAULT_FIND_LIMIT = 50;

export async function handleFindFeatures(
  client: ManifestClient,
  params: FindFeaturesParams,
): Promise<string> {
  try {
    const limit = params.limit ?? DEFAULT_FIND_LIMIT;
    const features = await client.findFeatures({ ...params, limit });
    if (!features || features.length === 0) return 'No features found.';

    const rows = features.map((f: FeatureListItem) => [
      f.display_id ?? f.id.slice(0, 8),
      f.id,
      stateSymbol(f.state),
      String(f.priority),
      f.title,
    ]);
    let result = markdownTable(['ID', 'UUID', 'State', 'P', 'Title'], rows);
    if (features.length >= limit) {
      result += `\n\nShowing first ${limit} results. Use limit/offset for more.`;
    }
    return result;
  } catch (err) {
    return handleError(err);
  }
}

// ============================================================
// get_feature
// ============================================================

interface GetFeatureParams {
  feature_id: string;
  view?: 'card' | 'full';
  include_history?: boolean;
}

export async function handleGetFeature(
  client: ManifestClient,
  params: GetFeatureParams,
): Promise<string> {
  try {
    const ctx = await client.getFeatureContext(params.feature_id);
    const view = params.view ?? 'card';

    // Card view — compact, pre-formatted, ready for direct display
    if (view === 'card') {
      return renderFeatureCard(ctx, client.webUrl);
    }

    // Full view — includes breadcrumb context, siblings, and optional history
    const parts: string[] = [];

    // Header
    parts.push(`Feature: '${ctx.title}' (${ctx.state})`);
    if (ctx.display_id) parts.push(`Display ID: ${ctx.display_id}`);
    parts.push(`ID: ${ctx.id}`);
    parts.push(`Priority: ${ctx.priority}`);
    if (ctx.parent) parts.push(`Parent: ${ctx.parent.title}`);
    const webUrl = featureWebUrl(client.webUrl, ctx.project_slug, ctx.display_id);
    if (webUrl) parts.push(`Web: ${webUrl}`);

    // Breadcrumb context
    if (ctx.breadcrumb.length > 0) {
      const budgeted = lodBreadcrumb(ctx.breadcrumb);
      const withDetails = budgeted.filter((b) => b.details);
      if (withDetails.length > 0) {
        parts.push('');
        parts.push('## Ancestor Context');
        for (const item of withDetails) {
          parts.push(`### ${item.title}`);
          parts.push(item.details!);
        }
      }
    }

    // Details
    if (ctx.details) {
      parts.push('');
      parts.push('## Details');
      parts.push(ctx.details);
    }

    // Desired details (change request)
    if (ctx.desired_details) {
      parts.push('');
      parts.push('## Desired Changes');
      parts.push(ctx.desired_details);
    }

    // Children
    if (ctx.children.length > 0) {
      parts.push('');
      parts.push('## Children');
      for (const child of ctx.children) {
        const cid = child.display_id ?? child.id?.slice(0, 8) ?? '';
        parts.push(`  ${stateSymbol(child.state)} ${cid} ${child.title}`);
      }
    }

    // Siblings
    if (ctx.siblings.length > 0) {
      parts.push('');
      parts.push('## Siblings');
      for (const sib of ctx.siblings) {
        const sid = sib.display_id ?? sib.id?.slice(0, 8) ?? '';
        parts.push(`  ${stateSymbol(sib.state)} ${sid} ${sib.title}`);
      }
    }

    // History
    if (params.include_history) {
      const history = await client.getFeatureHistory(params.feature_id);
      if (history.length > 0) {
        parts.push('');
        parts.push('## History');
        for (const entry of history) {
          parts.push(`- ${entry.created_at}: ${entry.summary}`);
        }
      }
    }

    return parts.join('\n');
  } catch (err) {
    return handleError(err);
  }
}

// ============================================================
// get_next_feature
// ============================================================

interface GetNextFeatureParams {
  project_id?: string;
  directory_path?: string;
  version_id?: string;
}

export async function handleGetNextFeature(
  client: ManifestClient,
  params: GetNextFeatureParams,
): Promise<string> {
  try {
    const projectId = await resolveProjectId(client, params);
    if (!projectId) return 'No project found. Pass project_id or directory_path.';
    const result = await client.getNextFeature(projectId, params.version_id);
    if (!result || !result.id) return 'No workable features found.';
    return formatFeatureSummary(result);
  } catch (err) {
    if (err instanceof NotFoundError) return 'No workable features found.';
    if (err instanceof ConflictError) {
      return formatStaleFeatures(err.body);
    }
    return handleError(err);
  }
}

function formatStaleFeatures(body: string): string {
  const data = parseInProgressFeatureResponse(body);
  if (!data) return body;

  const completable = data.features.filter((feature) => feature.completable);
  const stalled = data.features.filter((feature) => !feature.completable);
  const parts: string[] = [`## ${data.features.length} feature(s) still in progress\n`];

  appendCompletableSection(parts, completable);
  appendStalledSection(parts, stalled, completable.length > 0);

  parts.push('\nComplete or archive these before starting new work.');
  return parts.join('\n');
}

// ============================================================
// render_feature_tree
// ============================================================

interface RenderFeatureTreeParams {
  project_id?: string;
  directory_path?: string;
  max_depth?: number;
  state?: string;
}

export async function handleRenderFeatureTree(
  client: ManifestClient,
  params: RenderFeatureTreeParams,
): Promise<string> {
  try {
    const projectId = await resolveProjectId(client, params);
    if (!projectId) return 'No project found. Pass project_id or directory_path.';
    let tree = await client.getFeatureTree(projectId);
    if (!tree || tree.length === 0) return 'No features found.';

    // Filter by state if requested (keeps parent structure for context)
    if (params.state) {
      const targetState = params.state;
      tree = filterTree(tree, (node) => node.state === targetState);
      if (tree.length === 0) return `No ${targetState} features found.`;
    }

    const keyPrefix = await loadProjectKeyPrefix(client, projectId, tree.length > 0);
    return renderTree(tree, params.max_depth ?? 0, keyPrefix);
  } catch (err) {
    return handleError(err);
  }
}

// ============================================================
// orient
// ============================================================

interface OrientParams {
  project_id?: string;
  directory_path?: string;
}

export async function handleOrient(
  client: ManifestClient,
  params: OrientParams,
): Promise<string> {
  try {
    const projectContext = await resolveOrientProject(client, params);
    if (!projectContext) return 'No project found. Use init_project to create one.';
    const { projectId, projectName } = projectContext;

    // Parallel fetch
    const [tree, proposed, history] = await Promise.all([
      client.getFeatureTree(projectId).catch(() => []),
      client.findFeatures({ project_id: projectId, state: 'proposed', limit: 3 }).catch(() => []),
      client.getProjectHistory(projectId, { limit: 5 }).catch(() => []),
    ]);
    // Empty project detection: single root node with no children
    const isEmpty = Array.isArray(tree)
      && tree.length === 1
      && tree[0].is_root === true
      && tree[0].children.length === 0;

    if (isEmpty) {
      return formatEmptyProjectGuidance(projectName, projectId);
    }

    const keyPrefix = await loadProjectKeyPrefix(client, projectId, Array.isArray(tree) && tree.length > 0);

    const parts: string[] = [];

    // Project header
    if (projectName) parts.push(`# ${projectName}`);
    parts.push(`Project: ${projectId}`);

    // Tree (max depth 2 for overview)
    if (Array.isArray(tree) && tree.length > 0) {
      parts.push('');
      parts.push('## Feature Tree');
      parts.push(renderTree(tree, 2, keyPrefix));
    }

    // Work queue
    if (Array.isArray(proposed) && proposed.length > 0) {
      parts.push('');
      parts.push('## Next Up');
      for (const f of proposed) {
        parts.push(`  ${stateSymbol(f.state)} ${f.title}`);
      }
    }

    // Recent history
    if (Array.isArray(history) && history.length > 0) {
      parts.push('');
      parts.push('## Recent Activity');
      for (const entry of history) {
        const headline = (entry.summary ?? '').split('\n')[0].trim();
        parts.push(`  ${stateSymbol(entry.feature_state)} ${entry.feature_title} -- ${headline}`);
      }
    }

    return parts.join('\n');
  } catch (err) {
    return handleError(err);
  }
}

// ============================================================
// get_template
// ============================================================

interface GetTemplateParams {
  project_id: string;
}

export async function handleGetTemplate(
  client: ManifestClient,
  params: GetTemplateParams,
): Promise<string> {
  try {
    const template = await client.getProjectTemplate(params.project_id);
    if (!template) return 'No custom template configured. Use the default spec format: user story + context + acceptance criteria checkboxes.';
    return `## Spec Template: ${template.name}\n\n${template.content}`;
  } catch (err) {
    return handleError(err);
  }
}

// ============================================================
// Helpers
// ============================================================

function formatEmptyProjectGuidance(projectName: string, projectId: string): string {
  const parts: string[] = [];

  if (projectName) parts.push(`# ${projectName}`);
  parts.push(`Project: ${projectId}`);
  parts.push('');
  parts.push('## Empty Project');
  parts.push('This project has no features yet. The feature tree needs to be bootstrapped.');
  parts.push('');
  parts.push('## Next Steps');
  parts.push('1. Gather input: read a PRD, ask the user to describe capabilities, or analyze the codebase');
  parts.push('2. Decompose into capabilities: call decompose with confirm=false to preview the feature tree');
  parts.push('3. Confirm: call decompose with confirm=true to create the features');
  parts.push('4. Set root context: call update_feature on the root feature to add project overview, tech stack, and conventions');
  parts.push('5. Create versions: call create_version for initial milestones, then set_feature_version to assign features');

  return parts.join('\n');
}

/** Resolve project_id from either direct ID or directory_path auto-discovery. */
async function resolveProjectId(
  client: ManifestClient,
  params: { project_id?: string; directory_path?: string },
): Promise<string | null> {
  if (params.project_id) return params.project_id;
  if (!params.directory_path) return null;
  try {
    const project = resolveProject(await client.listProjectsByDirectory(params.directory_path));
    return project?.id ?? null;
  } catch (err) {
    if (err instanceof NotFoundError) return null;
    throw err;
  }
}

async function resolveOrientProject(
  client: ManifestClient,
  params: OrientParams,
): Promise<{ projectId: string; projectName: string } | null> {
  if (params.project_id) {
    return { projectId: params.project_id, projectName: '' };
  }
  if (!params.directory_path) return null;

  try {
    const project = resolveProject(await client.listProjectsByDirectory(params.directory_path));
    if (!project?.id) return null;
    return { projectId: project.id, projectName: project.name };
  } catch (err) {
    if (err instanceof NotFoundError) return null;
    throw err;
  }
}

async function loadProjectKeyPrefix(
  client: ManifestClient,
  projectId: string,
  shouldLoad: boolean,
): Promise<string> {
  if (!shouldLoad) return '';

  try {
    const project = await client.getProject(projectId);
    return project.key_prefix ?? '';
  } catch {
    return '';
  }
}

function resolveProject(result: ProjectLookupResult): Project | null {
  if (result.project && isProject(result.project)) {
    return result.project;
  }
  if (isProject(result)) {
    return result;
  }
  return null;
}

function isProject(value: unknown): value is Project {
  if (!value || typeof value !== 'object') return false;
  const project = value as Partial<Project>;
  return typeof project.id === 'string'
    && typeof project.name === 'string'
    && typeof project.key_prefix === 'string';
}

function isWrappedError(value: unknown): value is { error: unknown } {
  return !!value && typeof value === 'object' && 'error' in value;
}

function isInProgressFeatureResponse(value: unknown): value is InProgressFeatureResponse {
  if (!value || typeof value !== 'object') return false;
  const response = value as Partial<InProgressFeatureResponse>;
  return typeof response.error === 'string'
    && typeof response.message === 'string'
    && Array.isArray(response.features);
}

function parseInProgressFeatureResponse(body: string): InProgressFeatureResponse | null {
  try {
    let data: unknown = JSON.parse(body);
    if (isWrappedError(data) && typeof data.error === 'string' && data.error.startsWith('{')) {
      data = JSON.parse(data.error);
    }
    return isInProgressFeatureResponse(data) ? data : null;
  } catch {
    return null;
  }
}

function appendCompletableSection(parts: string[], features: InProgressFeatureItem[]): void {
  if (features.length === 0) return;

  parts.push(`### Ready to complete (${features.length})\n`);
  parts.push('These have passing proofs -- call complete_feature with a summary and commit SHAs:\n');
  for (const feature of features) {
    const id = feature.display_id ?? feature.id.slice(0, 8);
    parts.push(`- ${id} ${feature.title} [proof passed ${feature.proof_status?.created_at ?? ''}]`);
  }
}

function appendStalledSection(
  parts: string[],
  features: InProgressFeatureItem[],
  needsSpacer: boolean,
): void {
  if (features.length === 0) return;
  if (needsSpacer) parts.push('');

  parts.push(`### Still needs work (${features.length})\n`);
  for (const feature of features) {
    const id = feature.display_id ?? feature.id.slice(0, 8);
    const proofNote = feature.proof_status
      ? ` [proof failed, exit_code=${feature.proof_status.exit_code}]`
      : ' [no proof recorded]';
    parts.push(`- ${id} ${feature.title}${proofNote}`);
  }
}

function handleError(err: unknown): string {
  if (err instanceof ConnectionError) {
    return 'Cannot connect to Manifest server. Is it running? Start with: manifest serve';
  }
  if (err instanceof ApiError) {
    return `Error (${err.status}): ${err.body}`;
  }
  throw err;
}

function formatResponse(data: unknown): string {
  if (typeof data === 'string') return data;
  return JSON.stringify(data, null, 2);
}

/** Format a feature response (from get_next, get_active, etc.) as structured text. */
function formatFeatureSummary(feature: FeatureWithContext): string {
  const parts: string[] = [];

  // Header
  const displayId = feature.display_id
    ?? (feature.feature_number != null ? `#${feature.feature_number}` : feature.id?.slice(0, 8));
  parts.push(`Feature: ${displayId} ${feature.title} (${feature.state})`);
  parts.push(`ID: ${feature.id}`);
  parts.push(`Priority: ${feature.priority}`);
  if (feature.parent) parts.push(`Parent: ${feature.parent.title}`);

  // Breadcrumb path
  if (feature.breadcrumb?.length > 0) {
    const path = feature.breadcrumb.map((b) => b.title).join(' > ');
    parts.push(`Path: ${path}`);
  }

  // Details
  if (feature.details) {
    parts.push('');
    parts.push('## Details');
    parts.push(feature.details);
  }

  // Children
  if (feature.children?.length > 0) {
    parts.push('');
    parts.push('## Children');
    for (const child of feature.children) {
      parts.push(`  ${stateSymbol(child.state)} ${child.title}`);
    }
  }

  // Siblings
  if (feature.siblings?.length > 0) {
    parts.push('');
    parts.push('## Siblings');
    for (const sib of feature.siblings) {
      parts.push(`  ${stateSymbol(sib.state)} ${sib.title}`);
    }
  }

  return parts.join('\n');
}
