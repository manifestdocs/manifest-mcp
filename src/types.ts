/**
 * Manifest Core Types
 *
 * Ported from manifest-svelte/src/lib/types/core.ts.
 * Zero dependencies — this package owns its types.
 */

// ============================================================
// Enums
// ============================================================

export type FeatureState =
  | 'proposed'
  | 'blocked'
  | 'in_progress'
  | 'implemented'
  | 'deprecated';

export type SessionStatus = 'active' | 'completed' | 'failed';
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed';
export type AgentType = 'claude' | 'gemini' | 'codex' | 'pi';
export type TestState = 'passed' | 'failed' | 'errored' | 'skipped';

// ============================================================
// Project Types
// ============================================================

export interface Project {
  id: string;
  name: string;
  key_prefix: string;
  description?: string | null;
  current_version_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectDirectory {
  id: string;
  project_id: string;
  path: string;
  git_remote?: string | null;
  is_primary: boolean;
  instructions?: string | null;
  created_at: string;
}

export interface ProjectWithDirectories extends Project {
  directories: ProjectDirectory[];
}

export interface ProjectLookupResult {
  id?: string;
  project?: Project;
}

// ============================================================
// Version Types
// ============================================================

export interface Version {
  id: string;
  project_id: string;
  name: string;
  description?: string | null;
  released_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateVersionInput {
  name: string;
  description?: string | null;
}

// ============================================================
// Feature Types
// ============================================================

export interface Feature {
  id: string;
  project_id: string;
  parent_id?: string | null;
  title: string;
  story?: string | null;
  details?: string | null;
  desired_details?: string | null;
  state: FeatureState;
  priority: number;
  feature_number?: number | null;
  target_version_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateFeatureInput {
  parent_id?: string | null;
  title: string;
  story?: string | null;
  details?: string | null;
  state?: FeatureState;
  priority?: number;
  target_version_id?: string | null;
}

export interface UpdateFeatureInput {
  title?: string;
  story?: string | null;
  details?: string | null;
  desired_details?: string | null;
  details_summary?: string | null;
  state?: FeatureState;
  priority?: number;
  parent_id?: string | null;
  target_version_id?: string | null;
  clear_version?: boolean;
  blocked_by?: string[];
}

export interface FeatureTreeNode extends Feature {
  children: FeatureTreeNode[];
  is_root?: boolean;
}

export interface FeatureListItem {
  id: string;
  display_id?: string | null;
  title: string;
  state: string;
  priority: number;
}

export interface ProofStatus {
  exit_code: number;
  created_at: string;
}

export interface InProgressFeatureItem {
  id: string;
  title: string;
  display_id?: string | null;
  state?: string;
  priority?: number;
  proof_status?: ProofStatus | null;
  completable: boolean;
}

export interface InProgressFeatureResponse {
  error: string;
  message: string;
  features: InProgressFeatureItem[];
}

export interface FeatureHistory {
  id: string;
  feature_id: string;
  session_id?: string | null;
  summary: string;
  files_changed?: string[] | null;
  author: string;
  created_at: string;
}

// ============================================================
// Context Types (MCP response shapes)
// ============================================================

export interface BreadcrumbItem {
  id: string;
  display_id?: string | null;
  title: string;
  details?: string | null;
}

export interface FeatureSummaryContext {
  id: string;
  display_id?: string | null;
  title: string;
  state: string;
}

export interface FeatureWithContext {
  id: string;
  display_id?: string | null;
  project_slug?: string | null;
  title: string;
  details?: string | null;
  desired_details?: string | null;
  state: string;
  priority: number;
  feature_number?: number | null;
  target_version_id?: string | null;
  parent?: FeatureSummaryContext | null;
  siblings: FeatureSummaryContext[];
  children: FeatureSummaryContext[];
  breadcrumb: BreadcrumbItem[];
}

// ============================================================
// Proof Types
// ============================================================

export interface TestSuiteInput {
  name: string;
  file?: string | null;
  tests: TestResultInput[];
}

export interface TestResultInput {
  name: string;
  suite?: string | null;
  state: TestState;
  file?: string | null;
  line?: number | null;
  duration_ms?: number | null;
  message?: string | null;
}

export interface EvidenceInput {
  path: string;
  note?: string | null;
}

// ============================================================
// Commit Types
// ============================================================

export interface CommitRef {
  sha: string;
  message: string;
  author?: string | null;
}

export interface FeatureProof {
  id?: string;
  command: string;
  exit_code: number;
  output?: string | null;
  test_suites?: TestSuiteInput[];
  tests?: TestResultInput[];
  evidence?: EvidenceInput[];
  commit_sha?: string | null;
  agent_type?: string | null;
  created_at?: string;
}

export interface StartFeatureResponse extends FeatureWithContext {
  feature_tier?: string;
  spec_status?: string;
  spec_guidance?: string;
  testing_guidance?: string;
}

// ============================================================
// Version Response Types
// ============================================================

export interface VersionInfo {
  id: string;
  name: string;
  description?: string | null;
  released_at?: string | null;
  feature_count: number;
  status: string;
}

export interface VersionListResponse {
  versions: VersionInfo[];
  next?: string | null;
  backlog_count: number;
}

// ============================================================
// Plan Types
// ============================================================

export interface ProposedFeature {
  title: string;
  details?: string | null;
  priority: number;
  state?: string | null;
  children: ProposedFeature[];
}

// ============================================================
// Verification Types
// ============================================================

export interface VerificationComment {
  severity: 'critical' | 'major' | 'minor';
  title: string;
  body: string;
  file?: string | null;
}

// ============================================================
// Orient Response Types
// ============================================================

export interface ActiveSessionInfo {
  feature_title: string;
  agent_type: string;
  claimed_at: string;
}

export interface WorkQueueItem {
  id: string;
  display_id?: string | null;
  title: string;
  priority: number;
}

export interface RecentHistoryItem {
  feature_title: string;
  summary_headline: string;
  completed_at: string;
}

// ============================================================
// History Types
// ============================================================

export interface ProjectHistoryEntry {
  feature_title: string;
  feature_state: string;
  summary: string;
  commits: CommitRef[];
  created_at: string;
}
