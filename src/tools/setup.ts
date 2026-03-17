/**
 * Setup tools — init, plan, create, delete features and project directories.
 */

import type { ManifestClient } from '../client.js';
import { ApiError } from '../client.js';

// ============================================================
// init_project
// ============================================================

interface InitProjectParams {
  directory_path: string;
  skip_default_versions?: boolean;
}

export async function handleInitProject(
  client: ManifestClient,
  params: InitProjectParams,
): Promise<string> {
  try {
    const result = await client.initProject(params);
    return formatResponse(result);
  } catch (err) {
    if (err instanceof ApiError) {
      return `Error (${err.status}): ${err.body}`;
    }
    throw err;
  }
}

// ============================================================
// add_project_directory
// ============================================================

interface AddProjectDirectoryParams {
  project_id: string;
  path: string;
  git_remote?: string;
  is_primary?: boolean;
  instructions?: string;
}

export async function handleAddProjectDirectory(
  client: ManifestClient,
  params: AddProjectDirectoryParams,
): Promise<string> {
  const { project_id, ...input } = params;
  try {
    const result = await client.addProjectDirectory(project_id, input);
    return formatResponse(result);
  } catch (err) {
    if (err instanceof ApiError) {
      return `Error (${err.status}): ${err.body}`;
    }
    throw err;
  }
}

// ============================================================
// create_feature
// ============================================================

interface CreateFeatureParams {
  project_id: string;
  parent_id?: string;
  title: string;
  details?: string;
  state?: string;
  priority?: number;
}

export async function handleCreateFeature(
  client: ManifestClient,
  params: CreateFeatureParams,
): Promise<string> {
  const { project_id, ...input } = params;
  try {
    const result = await client.createFeature(project_id, input as any);
    return `Created '${result.title}' (${result.state})\nid: ${result.id}`;
  } catch (err) {
    if (err instanceof ApiError) {
      return `Error (${err.status}): ${err.body}`;
    }
    throw err;
  }
}

// ============================================================
// delete_feature
// ============================================================

interface DeleteFeatureParams {
  feature_id: string;
}

export async function handleDeleteFeature(
  client: ManifestClient,
  params: DeleteFeatureParams,
): Promise<string> {
  try {
    await client.deleteFeature(params.feature_id);
    return `Deleted feature ${params.feature_id}`;
  } catch (err) {
    if (err instanceof ApiError) {
      return `Error (${err.status}): ${err.body}`;
    }
    throw err;
  }
}

// ============================================================
// plan
// ============================================================

interface PlanParams {
  project_id: string;
  features: Array<{
    title: string;
    details?: string;
    priority: number;
    state?: string;
    children: any[];
  }>;
  confirm: boolean;
  target_version_id?: string;
}

export async function handlePlan(
  client: ManifestClient,
  params: PlanParams,
): Promise<string> {
  const { project_id, ...input } = params;
  try {
    const result = await client.planFeatures(project_id, input);
    return formatResponse(result);
  } catch (err) {
    if (err instanceof ApiError) {
      return `Error (${err.status}): ${err.body}`;
    }
    throw err;
  }
}

// ============================================================
// get_project_instructions
// ============================================================

interface GetProjectInstructionsParams {
  project_id: string;
}

export async function handleGetProjectInstructions(
  client: ManifestClient,
  params: GetProjectInstructionsParams,
): Promise<string> {
  try {
    const project = await client.getProject(params.project_id);
    if (!project.instructions) return 'No project instructions set.';
    return project.instructions;
  } catch (err) {
    if (err instanceof ApiError) {
      return `Error (${err.status}): ${err.body}`;
    }
    throw err;
  }
}

// ============================================================
// get_project_history
// ============================================================

interface GetProjectHistoryParams {
  project_id: string;
  feature_id?: string;
  limit?: number;
}

export async function handleGetProjectHistory(
  client: ManifestClient,
  params: GetProjectHistoryParams,
): Promise<string> {
  const { project_id, ...options } = params;
  try {
    const result = await client.getProjectHistory(project_id, options);
    return formatResponse(result);
  } catch (err) {
    if (err instanceof ApiError) {
      return `Error (${err.status}): ${err.body}`;
    }
    throw err;
  }
}

// ============================================================
// generate_feature_tree
// ============================================================

interface GenerateFeatureTreeParams {
  directory_path: string;
}

export async function handleGenerateFeatureTree(
  client: ManifestClient,
  params: GenerateFeatureTreeParams,
): Promise<string> {
  try {
    const result = await client.analyzeCodebase(params.directory_path);
    return formatResponse(result);
  } catch (err) {
    if (err instanceof ApiError) {
      return `Error (${err.status}): ${err.body}`;
    }
    throw err;
  }
}

// ============================================================
// sync
// ============================================================

interface SyncParams {
  project_id: string;
}

export async function handleSync(
  client: ManifestClient,
  params: SyncParams,
): Promise<string> {
  try {
    const result = await client.syncFeatures(params.project_id);
    return formatResponse(result);
  } catch (err) {
    if (err instanceof ApiError) {
      return `Error (${err.status}): ${err.body}`;
    }
    throw err;
  }
}

// ============================================================
// Helpers
// ============================================================

function formatResponse(data: unknown): string {
  if (typeof data === 'string') return data;
  return JSON.stringify(data, null, 2);
}
