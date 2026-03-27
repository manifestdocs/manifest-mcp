/**
 * Team tools — plan agent teams and generate spawn context from features.
 */

import type { ManifestClient } from '../client.js';
import { ApiError, ConnectionError, NotFoundError } from '../client.js';
import type {
  FeatureTreeNode,
  FeatureWithContext,
  ProjectDirectory,
  VersionInfo,
} from '../types.js';
import { stateSymbol } from '../format.js';

// ============================================================
// get_spawn_context
// ============================================================

interface GetSpawnContextParams {
  feature_ids: string[];
  include_project_context?: boolean;
}

export async function handleGetSpawnContext(
  client: ManifestClient,
  params: GetSpawnContextParams,
): Promise<string> {
  try {
    if (params.feature_ids.length === 0) {
      return 'Error: feature_ids must contain at least one feature ID.';
    }
    if (params.feature_ids.length > 6) {
      return 'Error: feature_ids must contain at most 6 features.';
    }

    // Fetch all features in parallel
    const features = await Promise.all(
      params.feature_ids.map((id) => client.getFeatureContext(id)),
    );

    // Fetch project context if requested
    let directories: ProjectDirectory[] = [];
    let projectName = '';
    const includeProject = params.include_project_context !== false;
    if (includeProject && features.length > 0) {
      try {
        // Get project_id from the raw feature, then fetch project with directories
        const rawFeature = await client.getFeature(params.feature_ids[0]);
        const project = await client.getProject(rawFeature.project_id);
        projectName = project.name;
        directories = project.directories ?? [];
      } catch {
        // Project context is optional; continue without it
      }
    }

    return formatSpawnContext(features, projectName, directories);
  } catch (err) {
    return handleError(err);
  }
}

function formatSpawnContext(
  features: FeatureWithContext[],
  projectName: string,
  directories: ProjectDirectory[],
): string {
  const parts: string[] = [];

  // Header with workflow instructions
  parts.push('# Your Assignment');
  parts.push('');
  if (projectName) {
    parts.push(`You are a teammate working on project "${projectName}".`);
  } else {
    parts.push('You are a teammate in an Agent Team.');
  }
  parts.push('Work through these features in order. For each feature:');
  parts.push('1. Call `start_feature` with the feature ID to claim it');
  parts.push('2. Implement according to the spec and acceptance criteria');
  parts.push('3. Run tests and call `prove_feature` with the test output');
  parts.push('4. Call `complete_feature` when done');
  parts.push('');

  // Each feature
  for (let i = 0; i < features.length; i++) {
    const f = features[i];
    const displayId = f.display_id ?? f.id.slice(0, 8);
    const num = features.length > 1 ? ` ${i + 1}` : '';

    parts.push(`## Feature${num}: ${displayId} ${f.title}`);
    parts.push(`State: ${f.state} | Priority: ${f.priority}`);
    if (f.target_version_id) parts.push(`Version: ${f.target_version_id}`);
    parts.push('');

    // Spec
    if (f.details) {
      parts.push('### Specification');
      parts.push(f.details);
      parts.push('');
    } else {
      parts.push('### Specification');
      parts.push('(No spec written yet -- write one before implementing)');
      parts.push('');
    }

    // Context: parent, siblings
    if (f.parent || f.siblings.length > 0) {
      parts.push('### Context');
      if (f.parent) {
        const pid = f.parent.display_id ?? f.parent.id?.slice(0, 8) ?? '';
        parts.push(`Parent: ${pid} ${f.parent.title} (${f.parent.state})`);
      }
      if (f.siblings.length > 0) {
        const sibParts = f.siblings.map((s) => {
          const sid = s.display_id ?? s.id?.slice(0, 8) ?? '';
          return `${sid} ${s.title} (${s.state})`;
        });
        parts.push(`Siblings: ${sibParts.join(', ')}`);
      }
      parts.push('');
    }

    // Breadcrumb ancestor context (shared architectural notes)
    const ancestorsWithDetails = f.breadcrumb.filter((b) => b.details);
    if (ancestorsWithDetails.length > 0) {
      parts.push('### Ancestor Context');
      for (const ancestor of ancestorsWithDetails) {
        parts.push(`**${ancestor.title}**`);
        parts.push(ancestor.details!);
        parts.push('');
      }
    }
  }

  // Project context
  if (directories.length > 0) {
    parts.push('## Project Context');
    for (const dir of directories) {
      const label = dir.is_primary ? ' (primary)' : '';
      parts.push(`Directory: ${dir.path}${label}`);
      if (dir.instructions) parts.push(`Instructions: ${dir.instructions}`);
    }
    parts.push('');
  }

  return parts.join('\n');
}

// ============================================================
// plan_team
// ============================================================

interface PlanTeamParams {
  project_id?: string;
  directory_path?: string;
  feature_id?: string;
  version_id?: string;
  max_teammates?: number;
}

export async function handlePlanTeam(
  client: ManifestClient,
  params: PlanTeamParams,
): Promise<string> {
  try {
    // Feature set scope: plan team around a parent feature's children
    if (params.feature_id) {
      return planForFeatureSet(client, params);
    }

    // Version scope (default): plan team across the feature tree for a version
    return planForVersion(client, params);
  } catch (err) {
    return handleError(err);
  }
}

async function planForVersion(
  client: ManifestClient,
  params: PlanTeamParams,
): Promise<string> {
  const projectId = await resolveProjectId(client, params);
  if (!projectId) return 'No project found. Pass project_id or directory_path.';

  const maxTeammates = Math.min(params.max_teammates ?? 5, 8);

  // Fetch tree, versions, and project info in parallel
  const [tree, versionsResp, project] = await Promise.all([
    client.getFeatureTree(projectId),
    client.listVersions(projectId),
    client.getProject(projectId),
  ]);

  if (!tree || tree.length === 0) return 'No features found.';

  // Resolve target version
  const targetVersionId = params.version_id ?? findNextVersion(versionsResp.versions);
  const versionName = targetVersionId
    ? versionsResp.versions.find((v) => v.id === targetVersionId)?.name ?? targetVersionId
    : 'backlog';

  // Collect workable leaves: proposed or blocked leaves in the target version
  const leaves = collectWorkableLeaves(tree, targetVersionId);

  if (leaves.length === 0) {
    return `No workable features found for version ${versionName}. All features may be implemented or in progress.`;
  }

  // Cluster by parent
  const clusters = clusterByParent(leaves);

  // Calculate team size: 5-6 features per teammate
  const teamSize = Math.max(1, Math.min(Math.ceil(leaves.length / 5), maxTeammates));

  // Assign clusters to teammates, keeping same-parent features together
  const assignments = assignClusters(clusters, teamSize);

  return formatTeamPlan(
    assignments,
    versionName,
    leaves.length,
    clusters.length,
    project.key_prefix,
    project.directories ?? [],
  );
}

async function planForFeatureSet(
  client: ManifestClient,
  params: PlanTeamParams,
): Promise<string> {
  const featureId = params.feature_id!;
  const maxTeammates = Math.min(params.max_teammates ?? 5, 8);

  // Fetch the parent feature context (includes children)
  const parent = await client.getFeatureContext(featureId);

  if (parent.children.length === 0) {
    return `Feature "${parent.title}" has no children. Feature set scope requires a parent feature with leaf children.`;
  }

  // Fetch full context for each child to get details/state
  const children = await Promise.all(
    parent.children.map((c) => client.getFeatureContext(c.id)),
  );

  // Filter to workable children
  const workable = children.filter(
    (c) => c.state === 'proposed' || c.state === 'blocked',
  );

  if (workable.length === 0) {
    return `No workable children in feature set "${parent.title}". All children may be implemented or in progress.`;
  }

  // Get project info for key prefix and directories
  const rawFeature = await client.getFeature(featureId);
  const project = await client.getProject(rawFeature.project_id);

  // For feature sets, each child is one task -- one teammate per ~5 features
  const teamSize = Math.max(1, Math.min(Math.ceil(workable.length / 5), maxTeammates));

  // Build leaves from children (all share the same parent)
  const leaves: WorkableLeaf[] = workable.map((c) => ({
    id: c.id,
    displayId: c.display_id ?? c.id.slice(0, 8),
    title: c.title,
    state: c.state,
    priority: c.priority,
    parentId: parent.id,
    parentTitle: parent.title,
  }));

  // Sort by priority
  leaves.sort((a, b) => a.priority - b.priority || a.title.localeCompare(b.title));

  // Distribute leaves evenly across teammates
  const assignments: TeammateAssignment[] = Array.from({ length: teamSize }, () => ({
    name: '',
    parentTitle: parent.title,
    features: [],
  }));

  for (let i = 0; i < leaves.length; i++) {
    assignments[i % teamSize].features.push(leaves[i]);
  }

  // Name teammates by index within the parent domain
  const baseSlug = slugify(parent.title);
  for (let i = 0; i < assignments.length; i++) {
    assignments[i].name = assignments.length === 1 ? baseSlug : `${baseSlug}-${i + 1}`;
  }

  const scopeLabel = parent.display_id
    ? `${parent.display_id} ${parent.title}`
    : parent.title;

  return formatTeamPlan(
    assignments,
    scopeLabel,
    workable.length,
    1,
    project.key_prefix,
    project.directories ?? [],
  );
}

// ============================================================
// Tree traversal helpers
// ============================================================

interface WorkableLeaf {
  id: string;
  displayId: string;
  title: string;
  state: string;
  priority: number;
  parentId: string | null;
  parentTitle: string;
}

interface Cluster {
  parentTitle: string;
  parentId: string | null;
  leaves: WorkableLeaf[];
}

interface TeammateAssignment {
  name: string;
  parentTitle: string;
  features: WorkableLeaf[];
}

function collectWorkableLeaves(
  nodes: FeatureTreeNode[],
  targetVersionId: string | null,
): WorkableLeaf[] {
  const leaves: WorkableLeaf[] = [];

  function walk(node: FeatureTreeNode, parentTitle: string): void {
    const isLeaf = node.children.length === 0;

    if (isLeaf && !node.is_root) {
      const isWorkable = node.state === 'proposed' || node.state === 'blocked';
      const matchesVersion = !targetVersionId
        || node.target_version_id === targetVersionId
        || !node.target_version_id; // Include unassigned features when targeting a version

      if (isWorkable && matchesVersion) {
        const displayId = node.feature_number != null
          ? `${node.feature_number}`
          : node.id.slice(0, 8);
        leaves.push({
          id: node.id,
          displayId,
          title: node.title,
          state: node.state,
          priority: node.priority,
          parentId: node.parent_id ?? null,
          parentTitle: parentTitle,
        });
      }
    }

    for (const child of node.children) {
      walk(child, node.is_root ? 'root' : node.title);
    }
  }

  for (const node of nodes) {
    walk(node, 'root');
  }

  // Sort by priority (lower = first), then title
  leaves.sort((a, b) => a.priority - b.priority || a.title.localeCompare(b.title));
  return leaves;
}

function clusterByParent(leaves: WorkableLeaf[]): Cluster[] {
  const map = new Map<string, Cluster>();

  for (const leaf of leaves) {
    const key = leaf.parentId ?? '__root__';
    let cluster = map.get(key);
    if (!cluster) {
      cluster = { parentTitle: leaf.parentTitle, parentId: leaf.parentId, leaves: [] };
      map.set(key, cluster);
    }
    cluster.leaves.push(leaf);
  }

  // Sort clusters by total priority (lowest first = highest priority cluster)
  const clusters = Array.from(map.values());
  clusters.sort((a, b) => {
    const aMin = Math.min(...a.leaves.map((l) => l.priority));
    const bMin = Math.min(...b.leaves.map((l) => l.priority));
    return aMin - bMin;
  });

  return clusters;
}

function assignClusters(clusters: Cluster[], teamSize: number): TeammateAssignment[] {
  const assignments: TeammateAssignment[] = Array.from({ length: teamSize }, (_, i) => ({
    name: '',
    parentTitle: '',
    features: [],
  }));

  // Assign clusters to the teammate with the fewest features (greedy)
  for (const cluster of clusters) {
    // Find the teammate with the least features
    const target = assignments.reduce((min, curr) =>
      curr.features.length < min.features.length ? curr : min,
    );
    target.features.push(...cluster.leaves);
    // Use the first cluster's parent as the teammate's domain label
    if (!target.parentTitle) {
      target.parentTitle = cluster.parentTitle;
    }
  }

  // Remove empty teammates (if fewer clusters than team size)
  const active = assignments.filter((a) => a.features.length > 0);

  // Generate short names from parent titles
  const usedNames = new Set<string>();
  for (const assignment of active) {
    const base = slugify(assignment.parentTitle);
    let name = base;
    let counter = 2;
    while (usedNames.has(name)) {
      name = `${base}-${counter}`;
      counter++;
    }
    usedNames.add(name);
    assignment.name = name;
  }

  return active;
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 20) || 'teammate';
}

function findNextVersion(versions: VersionInfo[]): string | null {
  // Find the first unreleased version marked as "next"
  const next = versions.find((v) => v.status === 'next');
  if (next) return next.id;

  // Fall back to first unreleased version
  const unreleased = versions.find((v) => !v.released_at);
  return unreleased?.id ?? null;
}

function formatTeamPlan(
  assignments: TeammateAssignment[],
  versionName: string,
  totalFeatures: number,
  totalModules: number,
  keyPrefix: string,
  directories: ProjectDirectory[],
): string {
  const parts: string[] = [];

  parts.push(`# Team Plan for ${versionName}`);
  parts.push('');
  parts.push(`${totalFeatures} features across ${totalModules} module(s) -- ${assignments.length} teammate(s) recommended`);
  parts.push('');

  for (let i = 0; i < assignments.length; i++) {
    const a = assignments[i];
    parts.push(`## Teammate ${i + 1}: "${a.name}" (${a.parentTitle})`);

    for (const f of a.features) {
      const id = keyPrefix ? `${keyPrefix}-${f.displayId}` : f.displayId;
      parts.push(`  ${stateSymbol(f.state)} ${id} ${f.title}`);
    }
    parts.push('');
  }

  // Conventions section
  parts.push('## Conventions');
  parts.push('');
  parts.push('Include the display ID in Agent Team task subjects so hooks can link tasks to features:');
  parts.push('  Task subject: "[KEY-123] Feature title"');
  parts.push('');
  parts.push('Use `get_spawn_context` with the feature IDs above to generate spawn prompts for each teammate.');

  // Directory hints
  if (directories.length > 0) {
    parts.push('');
    parts.push('## Project Directories');
    for (const dir of directories) {
      const label = dir.is_primary ? ' (primary)' : '';
      parts.push(`  ${dir.path}${label}`);
    }
  }

  return parts.join('\n');
}

// ============================================================
// Shared helpers
// ============================================================

async function resolveProjectId(
  client: ManifestClient,
  params: { project_id?: string; directory_path?: string },
): Promise<string | null> {
  if (params.project_id) return params.project_id;
  if (!params.directory_path) return null;
  try {
    const result = await client.listProjectsByDirectory(params.directory_path);
    const project = result.project ?? (isProject(result) ? result : null);
    return project?.id ?? null;
  } catch (err) {
    if (err instanceof NotFoundError) return null;
    throw err;
  }
}

function isProject(value: unknown): value is { id: string; name: string } {
  if (!value || typeof value !== 'object') return false;
  const p = value as Record<string, unknown>;
  return typeof p.id === 'string' && typeof p.name === 'string';
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
