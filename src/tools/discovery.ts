/**
 * Discovery tools — orient, find, and inspect features.
 */

import type { ManifestClient } from '../client.js';
import { ApiError, ConflictError, ConnectionError } from '../client.js';
import { renderTree, filterTree, stateSymbol, markdownTable, lodBreadcrumb, renderFeatureCard } from '../format.js';

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
      const resp = await client.listProjectsByDirectory(params.directory_path) as any;
      if (!resp || (!resp.id && (!resp.project || !resp.project.id))) return 'No projects found.';
      const project = resp.project ?? resp;
      return formatProjectSummary(project);
    }
    const projects = await client.listProjects();
    if (projects.length === 0) return 'No projects found.';
    if (projects.length === 1) return formatProjectSummary(projects[0]);
    const rows = projects.map((p: any) => [p.id, p.name, p.description ?? '']);
    return markdownTable(['ID', 'Name', 'Description'], rows);
  } catch (err) {
    return handleError(err);
  }
}

function formatProjectSummary(project: any): string {
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

export async function handleFindFeatures(
  client: ManifestClient,
  params: FindFeaturesParams,
): Promise<string> {
  try {
    const features = await client.findFeatures(params) as any[];
    if (!features || features.length === 0) return 'No features found.';

    const rows = features.map((f: any) => [
      f.display_id ?? f.id.slice(0, 8),
      f.id,
      stateSymbol(f.state),
      String(f.priority),
      f.title,
    ]);
    return markdownTable(['ID', 'UUID', 'State', 'P', 'Title'], rows);
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
    return renderFeatureCard(ctx);
  }

  // Full view — includes breadcrumb context, siblings, and optional history
  const parts: string[] = [];

  // Header
  parts.push(`Feature: '${ctx.title}' (${ctx.state})`);
  if (ctx.display_id) parts.push(`Display ID: ${ctx.display_id}`);
  parts.push(`ID: ${ctx.id}`);
  parts.push(`Priority: ${ctx.priority}`);
  if (ctx.parent) parts.push(`Parent: ${ctx.parent.title}`);

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
    const result = await client.getNextFeature(projectId, params.version_id) as any;
    if (!result || !result.id) return 'No workable features found.';
    return formatFeatureSummary(result);
  } catch (err) {
    if (err instanceof ConflictError) {
      return formatStaleFeatures(err.body);
    }
    return handleError(err);
  }
}

function formatStaleFeatures(body: string): string {
  try {
    let data = JSON.parse(body);
    // Handle double-encoded JSON (older server versions)
    if (typeof data.error === 'string' && data.error.startsWith('{')) {
      data = JSON.parse(data.error);
    }
    const features = data.features ?? [];
    const completable = features.filter((f: any) => f.completable);
    const stalled = features.filter((f: any) => !f.completable);
    const parts: string[] = [];
    parts.push(`## ${features.length} feature(s) still in progress\n`);

    if (completable.length > 0) {
      parts.push(`### Ready to complete (${completable.length})\n`);
      parts.push('These have passing proofs -- call manifest_complete_feature with a summary and commit SHAs:\n');
      for (const f of completable) {
        const id = f.display_id ?? f.id?.slice(0, 8);
        parts.push(`- ${id} ${f.title} [proof passed ${f.proof_status?.created_at ?? ''}]`);
      }
    }

    if (stalled.length > 0) {
      if (completable.length > 0) parts.push('');
      parts.push(`### Still needs work (${stalled.length})\n`);
      for (const f of stalled) {
        const id = f.display_id ?? f.id?.slice(0, 8);
        const proofNote = f.proof_status
          ? ` [proof failed, exit_code=${f.proof_status.exit_code}]`
          : ' [no proof recorded]';
        parts.push(`- ${id} ${f.title}${proofNote}`);
      }
    }

    parts.push('\nComplete or archive these before starting new work.');
    return parts.join('\n');
  } catch {
    return body;
  }
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

    // Fetch project to get key_prefix for display IDs
    let keyPrefix = '';
    try {
      const project = await client.getProject(projectId);
      keyPrefix = project.key_prefix ?? '';
    } catch {
      // Best effort — render without display IDs
    }

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
    // Resolve project
    let projectId = params.project_id;
    let projectName = '';
    if (!projectId && params.directory_path) {
      const resp = await client.listProjectsByDirectory(params.directory_path) as any;
      const project = resp?.project ?? resp;
      if (project?.id) {
        projectId = project.id;
        projectName = project.name;
      }
    }
    if (!projectId) return 'No project found. Use manifest_init_project to create one.';

    // Parallel fetch
    const [tree, proposed, history] = await Promise.all([
      client.getFeatureTree(projectId).catch(() => []),
      client.findFeatures({ project_id: projectId, state: 'proposed', limit: 3 }).catch(() => []),
      client.getProjectHistory(projectId, { limit: 5 }).catch(() => []),
    ]);

    const parts: string[] = [];

    // Project header
    if (projectName) {
      parts.push(`# ${projectName}`);
    }
    parts.push(`Project: ${projectId}`);

    // Tree (max depth 2 for overview)
    if (Array.isArray(tree) && tree.length > 0) {
      let keyPrefix = '';
      try {
        const project = await client.getProject(projectId);
        keyPrefix = project.key_prefix ?? '';
      } catch {
        // best effort
      }
      parts.push('');
      parts.push('## Feature Tree');
      parts.push(renderTree(tree, 2, keyPrefix));
    }



    // Work queue
    const proposedArr = proposed as any[];
    if (Array.isArray(proposedArr) && proposedArr.length > 0) {
      parts.push('');
      parts.push('## Next Up');
      for (const f of proposedArr) {
        parts.push(`  ${stateSymbol(f.state)} ${f.title}`);
      }
    }

    // Recent history
    const historyArr = history as any[];
    if (Array.isArray(historyArr) && historyArr.length > 0) {
      parts.push('');
      parts.push('## Recent Activity');
      for (const entry of historyArr) {
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
// Helpers
// ============================================================

/** Resolve project_id from either direct ID or directory_path auto-discovery. */
async function resolveProjectId(
  client: ManifestClient,
  params: { project_id?: string; directory_path?: string },
): Promise<string | null> {
  if (params.project_id) return params.project_id;
  if (!params.directory_path) return null;
  const resp = await client.listProjectsByDirectory(params.directory_path) as any;
  const project = resp?.project ?? resp;
  return project?.id ?? null;
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
function formatFeatureSummary(feature: any): string {
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
    const path = feature.breadcrumb.map((b: any) => b.title).join(' > ');
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
