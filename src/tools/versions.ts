/**
 * Version tools — list, create, assign, release versions.
 */

import type { ManifestClient } from '../client.js';
import { ApiError } from '../client.js';
import { markdownTable } from '../format.js';

// ============================================================
// list_versions
// ============================================================

interface ListVersionsParams {
  project_id: string;
}

export async function handleListVersions(
  client: ManifestClient,
  params: ListVersionsParams,
): Promise<string> {
  try {
    const resp = await client.listVersions(params.project_id);
    if (resp.versions.length === 0) return 'No versions defined.';

    const rows = resp.versions.map((v) => [
      v.id,
      v.name,
      v.status,
      String(v.feature_count),
      v.description ?? '',
    ]);
    let output = markdownTable(['ID', 'Version', 'Status', 'Features', 'Description'], rows);
    if (resp.backlog_count > 0) {
      output += `\nBacklog: ${resp.backlog_count} unassigned features`;
    }
    return output;
  } catch (err) {
    if (err instanceof ApiError) {
      return `Error (${err.status}): ${err.body}`;
    }
    throw err;
  }
}

// ============================================================
// create_version
// ============================================================

interface CreateVersionParams {
  project_id: string;
  name: string;
  description?: string;
}

export async function handleCreateVersion(
  client: ManifestClient,
  params: CreateVersionParams,
): Promise<string> {
  const { project_id, ...input } = params;
  try {
    const result = await client.createVersion(project_id, input);
    return `Created version '${result.name}'\nid: ${result.id}`;
  } catch (err) {
    if (err instanceof ApiError) {
      return `Error (${err.status}): ${err.body}`;
    }
    throw err;
  }
}

// ============================================================
// set_feature_version
// ============================================================

interface SetFeatureVersionParams {
  feature_id: string;
  version_id: string | null;
}

export async function handleSetFeatureVersion(
  client: ManifestClient,
  params: SetFeatureVersionParams,
): Promise<string> {
  try {
    await client.setFeatureVersion(params.feature_id, params.version_id);
    if (params.version_id === null) {
      return `Unassigned feature ${params.feature_id} from version (now in backlog)`;
    }
    return `Assigned feature ${params.feature_id} to version ${params.version_id}`;
  } catch (err) {
    if (err instanceof ApiError) {
      return `Error (${err.status}): ${err.body}`;
    }
    throw err;
  }
}

// ============================================================
// release_version
// ============================================================

interface ReleaseVersionParams {
  version_id: string;
}

export async function handleReleaseVersion(
  client: ManifestClient,
  params: ReleaseVersionParams,
): Promise<string> {
  try {
    const result = await client.releaseVersion(params.version_id);
    return `Released version ${params.version_id}\n${formatResponse(result)}`;
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
