/**
 * Work tools — claim, update, prove, and complete features.
 */

import type { ManifestClient } from '../client.js';
import { ApiError, ConflictError } from '../client.js';

// ============================================================
// start_feature
// ============================================================

interface StartFeatureParams {
  feature_id: string;
  agent_type?: string;
  force?: boolean;
  claim_metadata?: string;
}

export async function handleStartFeature(
  client: ManifestClient,
  params: StartFeatureParams,
): Promise<string> {
  try {
    const result = await client.startFeature(params.feature_id, {
      agent_type: params.agent_type ?? 'claude',
      force: params.force ?? false,
      claim_metadata: params.claim_metadata,
    }) as any;
    return formatStartResult(result);
  } catch (err) {
    if (err instanceof ConflictError) {
      return `Error: ${err.body}`;
    }
    if (err instanceof ApiError) {
      return `Error (${err.status}): ${err.body}`;
    }
    throw err;
  }
}

function formatStartResult(result: any): string {
  if (!result || typeof result !== 'object') return 'Feature started.';

  const parts: string[] = [];

  // Header
  const displayId = result.display_id ?? result.id?.slice(0, 8) ?? '';
  parts.push(`Started: ${displayId} ${result.title ?? ''} (${result.state ?? 'in_progress'})`);
  if (result.feature_tier) parts.push(`Tier: ${result.feature_tier}`);

  // Spec status
  if (result.spec_status) parts.push(`Spec: ${result.spec_status}`);

  // Breadcrumb
  if (result.breadcrumb?.length > 0) {
    const path = result.breadcrumb.map((b: any) => b.title).join(' > ');
    parts.push(`Path: ${path}`);
  }

  // Details (the spec to implement against)
  if (result.details) {
    parts.push('');
    parts.push('## Specification');
    parts.push(result.details);
  }

  // Desired details (change request)
  if (result.desired_details) {
    parts.push('');
    parts.push('## Requested Changes');
    parts.push(result.desired_details);
  }

  // Spec guidance
  if (result.spec_guidance) {
    parts.push('');
    parts.push('## Spec Guidance');
    parts.push(result.spec_guidance);
  }

  // Testing guidance
  if (result.testing_guidance) {
    parts.push('');
    parts.push('## Testing');
    parts.push(result.testing_guidance);
  }

  return parts.join('\n');
}

// ============================================================
// update_feature
// ============================================================

interface UpdateFeatureParams {
  feature_id: string;
  title?: string;
  details?: string;
  desired_details?: string;
  details_summary?: string;
  state?: string;
  priority?: number;
  parent_id?: string;
  target_version_id?: string;
  clear_version?: boolean;
  blocked_by?: string[];
}

export async function handleUpdateFeature(
  client: ManifestClient,
  params: UpdateFeatureParams,
): Promise<string> {
  const { feature_id, ...input } = params;
  try {
    const result = await client.updateFeature(feature_id, input as any);
    return `Updated '${result.title}' (${result.state})`;
  } catch (err) {
    if (err instanceof ApiError) {
      return `Error (${err.status}): ${err.body}`;
    }
    throw err;
  }
}

// ============================================================
// prove_feature
// ============================================================

interface ProveFeatureParams {
  feature_id: string;
  command: string;
  exit_code: number;
  output?: string;
  test_suites?: Array<{
    name: string;
    file?: string;
    tests: Array<{
      name: string;
      state: string;
      file?: string;
      line?: number;
      duration_ms?: number;
      message?: string;
    }>;
  }>;
  tests?: Array<{
    name: string;
    suite?: string;
    state: string;
    file?: string;
    line?: number;
    duration_ms?: number;
    message?: string;
  }>;
  evidence?: Array<{ path: string; note?: string }>;
  commit_sha?: string;
}

export async function handleProveFeature(
  client: ManifestClient,
  params: ProveFeatureParams,
): Promise<string> {
  const { feature_id, ...input } = params;
  try {
    const result = await client.proveFeature(feature_id, input as any) as any;
    const status = params.exit_code === 0 ? 'PASS' : 'FAIL';
    return `Proof recorded (${status})\nexit_code: ${params.exit_code}\ncommand: ${params.command}${result?.id ? `\nproof_id: ${result.id}` : ''}`;
  } catch (err) {
    if (err instanceof ApiError) {
      return `Error (${err.status}): ${err.body}`;
    }
    throw err;
  }
}

// ============================================================
// complete_feature
// ============================================================

interface CompleteFeatureParams {
  feature_id: string;
  summary: string;
  commits: (string | { sha: string; message: string })[];
  backfill?: boolean;
}

export async function handleCompleteFeature(
  client: ManifestClient,
  params: CompleteFeatureParams,
): Promise<string> {
  try {
    const result = await client.completeFeature(params.feature_id, {
      summary: params.summary,
      commits: params.commits,
      backfill: params.backfill ?? false,
    }) as any;
    const state = result?.state ?? 'implemented';
    return `Feature completed (${state})\nsummary: ${params.summary}`;
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
