/**
 * Verification tools — verify implementation against spec, record results.
 */

import type { ManifestClient } from '../client.js';
import { ApiError } from '../client.js';
import { renderProofChecklist, timeBucket } from '../format.js';

// ============================================================
// verify_feature
// ============================================================

interface VerifyFeatureParams {
  feature_id: string;
  commit_range?: string;
}

export async function handleVerifyFeature(
  client: ManifestClient,
  params: VerifyFeatureParams,
): Promise<string> {
  try {
    const result = await client.verifyFeature(params.feature_id, params.commit_range);
    return formatResponse(result);
  } catch (err) {
    if (err instanceof ApiError) {
      return `Error (${err.status}): ${err.body}`;
    }
    throw err;
  }
}

// ============================================================
// record_verification
// ============================================================

interface RecordVerificationParams {
  feature_id: string;
  comments: Array<{
    severity: string;
    title: string;
    body: string;
    file?: string;
  }>;
}

export async function handleRecordVerification(
  client: ManifestClient,
  params: RecordVerificationParams,
): Promise<string> {
  const { feature_id, ...input } = params;
  try {
    const result = await client.recordVerification(feature_id, input as any);
    const count = params.comments.length;
    if (count === 0) {
      return 'Verification recorded: passed (no comments)';
    }
    return `Verification recorded: ${count} comment${count === 1 ? '' : 's'}\n${formatResponse(result)}`;
  } catch (err) {
    if (err instanceof ApiError) {
      return `Error (${err.status}): ${err.body}`;
    }
    throw err;
  }
}

// ============================================================
// get_feature_proof
// ============================================================

interface GetFeatureProofParams {
  feature_id: string;
}

export async function handleGetFeatureProof(
  client: ManifestClient,
  params: GetFeatureProofParams,
): Promise<string> {
  try {
    const result = await client.getFeatureProof(params.feature_id) as any;
    if (!result) return 'No proof recorded for this feature.';
    return formatProof(result);
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.status === 404) return 'No proof recorded for this feature.';
      return `Error (${err.status}): ${err.body}`;
    }
    throw err;
  }
}

function formatProof(proof: any): string {
  const parts: string[] = [];
  const exitIcon = proof.exit_code === 0 ? '\u2713' : '\u2717'; // ✓ or ✗
  const status = proof.exit_code === 0 ? 'PASSED' : 'FAILED';
  const when = proof.created_at ? timeBucket(proof.created_at) : '';

  // Header
  parts.push(`${exitIcon} Proof: ${status}${when ? `  (${when})` : ''}`);
  parts.push(`  Command: ${proof.command}`);
  parts.push(`  Exit code: ${proof.exit_code}`);
  if (proof.agent_type) parts.push(`  Agent: ${proof.agent_type}`);
  if (proof.commit_sha) parts.push(`  Commit: ${proof.commit_sha}`);

  // Test results — use the checklist renderer
  const suites = proof.test_suites ?? proof.tests;
  if (Array.isArray(suites) && suites.length > 0) {
    parts.push('');
    parts.push(renderProofChecklist(suites));
  } else if (proof.output) {
    // Fallback to raw output if no structured tests
    parts.push('');
    parts.push('Output:');
    parts.push(proof.output);
  }

  // Evidence files
  if (Array.isArray(proof.evidence) && proof.evidence.length > 0) {
    parts.push('');
    parts.push('Evidence:');
    for (const e of proof.evidence) {
      const note = e.note ? ` -- ${e.note}` : '';
      parts.push(`  ${e.path}${note}`);
    }
  }

  return parts.join('\n');
}

// ============================================================
// Helpers
// ============================================================

function formatResponse(data: unknown): string {
  if (typeof data === 'string') return data;
  return JSON.stringify(data, null, 2);
}
