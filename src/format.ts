/**
 * Formatting utilities for Manifest tool output.
 *
 * Ported from manifest-server/src/mcp/tools/format.rs and tree_render.rs.
 */

import type { FeatureTreeNode, FeatureWithContext, BreadcrumbItem, ProjectHistoryEntry } from './types.js';

// ============================================================
// State Symbols
// ============================================================

const STATE_SYMBOLS: Record<string, string> = {
  proposed: '\u25c7',    // ◇
  blocked: '\u2298',     // ⊘
  in_progress: '\u25cb', // ○
  implemented: '\u25cf', // ●
  archived: '\u2717',    // ✗
};

const PROJECT_ROOT = '\u25a3'; // ▣

const TEST_STATE_SYMBOLS: Record<string, string> = {
  passed: '\u2713',  // ✓
  failed: '\u2717',  // ✗
  errored: '!',
  skipped: '\u2298', // ⊘
};

export function stateSymbol(state: string): string {
  return STATE_SYMBOLS[state] ?? '?';
}

export function testStateSymbol(state: string): string {
  return TEST_STATE_SYMBOLS[state] ?? '?';
}

// ============================================================
// Display ID
// ============================================================

export function displayId(
  featureNumber: number | null | undefined,
  keyPrefix: string,
  uuid?: string,
): string {
  if (featureNumber != null && keyPrefix) {
    return `${keyPrefix}-${featureNumber}`;
  }
  if (uuid) {
    return uuid.slice(0, 8);
  }
  return '?';
}

// ============================================================
// Feature Card
// ============================================================

/**
 * Render a feature as a compact card suitable for direct display.
 * Designed so agents can pass it through without reformatting.
 */
export function featureWebUrl(baseUrl: string, projectSlug?: string | null, displayId?: string | null): string | null {
  if (!projectSlug || !displayId) return null;
  return `${baseUrl}/app/${projectSlug}?feature=${displayId}`;
}

export function renderFeatureCard(ctx: FeatureWithContext, baseUrl?: string): string {
  const id = ctx.display_id ?? ctx.id.slice(0, 8);
  const sym = stateSymbol(ctx.state);
  const W = 60;
  const hr = '\u2500'.repeat(W);

  const lines: string[] = [];

  // Header
  lines.push(hr);
  lines.push(`${sym} ${id}  ${ctx.title}`);
  lines.push(`  State: ${ctx.state}  Priority: ${ctx.priority}`);
  if (ctx.parent) lines.push(`  Parent: ${ctx.parent.title}`);
  const webUrl = baseUrl ? featureWebUrl(baseUrl, ctx.project_slug, ctx.display_id) : null;
  if (webUrl) lines.push(`  Web: ${webUrl}`);
  lines.push(hr);

  // Details / spec
  if (ctx.details) {
    lines.push('');
    lines.push(ctx.details);
  } else {
    lines.push('');
    lines.push('(no spec written yet)');
  }

  // Desired changes (change request)
  if (ctx.desired_details) {
    lines.push('');
    lines.push(`${'- '.repeat(30)}`);
    lines.push('Requested changes:');
    lines.push(ctx.desired_details);
  }

  // Children (feature set)
  if (ctx.children.length > 0) {
    lines.push('');
    lines.push(hr);
    lines.push(`Children (${ctx.children.length}):`);
    for (const child of ctx.children) {
      const cid = child.display_id ?? child.id?.slice(0, 8) ?? '';
      lines.push(`  ${stateSymbol(child.state)} ${cid} ${child.title}`);
    }
  }

  lines.push(hr);
  return lines.join('\n');
}

// ============================================================
// Tree Rendering
// ============================================================

/**
 * Filter a tree to only include branches containing leaves that match the predicate.
 * Parent nodes are retained as structural context when they have matching descendants.
 */
export function filterTree(
  nodes: FeatureTreeNode[],
  predicate: (node: FeatureTreeNode) => boolean,
): FeatureTreeNode[] {
  const result: FeatureTreeNode[] = [];
  for (const node of nodes) {
    const isLeaf = node.children.length === 0;
    if (isLeaf) {
      if (predicate(node)) result.push(node);
    } else {
      const filteredChildren = filterTree(node.children, predicate);
      if (filteredChildren.length > 0) {
        result.push({ ...node, children: filteredChildren });
      }
    }
  }
  return result;
}

export function renderTree(
  nodes: FeatureTreeNode[],
  maxDepth: number,
  keyPrefix: string,
): string {
  let output = '';
  for (let i = 0; i < nodes.length; i++) {
    const isLast = i === nodes.length - 1;
    output += renderNode(nodes[i], '', isLast, true, 0, maxDepth, keyPrefix);
  }
  return output;
}

function renderNode(
  node: FeatureTreeNode,
  prefix: string,
  isLast: boolean,
  isTreeRoot: boolean,
  currentDepth: number,
  maxDepth: number,
  keyPrefix: string,
): string {
  let output = '';

  const isLeaf = node.children.length === 0;
  const symbol = node.is_root
    ? PROJECT_ROOT
    : isLeaf ? stateSymbol(node.state) : '';

  // Format display ID
  let idLabel = '';
  if (keyPrefix && node.feature_number != null) {
    idLabel = `${keyPrefix}-${node.feature_number} `;
  }

  const label = symbol ? `${symbol} ${idLabel}${node.title}` : `${idLabel}${node.title}`;

  if (isTreeRoot) {
    output += `${label}\n`;
  } else {
    const branch = isLast ? '\u2514\u2500\u2500 ' : '\u251c\u2500\u2500 ';
    output += `${prefix}${branch}${label}\n`;
  }

  const childPrefix = isTreeRoot
    ? ''
    : `${prefix}${isLast ? '    ' : '\u2502   '}`;

  const atDepthLimit = maxDepth > 0 && currentDepth >= maxDepth;

  if (atDepthLimit && node.children.length > 0) {
    output += `${childPrefix}\u2514\u2500\u2500 (...)\n`;
  } else {
    for (let i = 0; i < node.children.length; i++) {
      const childIsLast = i === node.children.length - 1;
      output += renderNode(
        node.children[i],
        childPrefix,
        childIsLast,
        false,
        currentDepth + 1,
        maxDepth,
        keyPrefix,
      );
    }
  }

  return output;
}

// ============================================================
// Markdown Table
// ============================================================

export function markdownTable(headers: string[], rows: string[][]): string {
  if (rows.length === 0) {
    return '(none)';
  }

  const widths = headers.map((h) => h.length);
  for (const row of rows) {
    for (let i = 0; i < row.length && i < widths.length; i++) {
      widths[i] = Math.max(widths[i], row[i].length);
    }
  }

  let out = '|';
  for (let i = 0; i < headers.length; i++) {
    out += ` ${headers[i].padEnd(widths[i])} |`;
  }
  out += '\n|';
  for (const w of widths) {
    out += ` ${'-'.repeat(w)} |`;
  }
  out += '\n';

  for (const row of rows) {
    out += '|';
    for (let i = 0; i < row.length; i++) {
      const w = widths[i] ?? 0;
      out += ` ${row[i].padEnd(w)} |`;
    }
    out += '\n';
  }

  return out;
}

// ============================================================
// Time Bucket
// ============================================================

export function timeBucket(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);

  // Calendar-day comparison
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const entryDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.floor((today.getTime() - entryDay.getTime()) / 86400000);

  if (diffMins < 5) return 'just now';
  if (diffMins < 60) {
    let bucket = Math.floor(diffMins / 15) * 15;
    if (bucket === 0) bucket = 15;
    return `${bucket} mins ago`;
  }
  if (diffDays === 0 && diffHours === 1) return '1 hour ago';
  if (diffDays === 0 && diffHours < 4) return `${diffHours} hours ago`;
  if (diffDays === 0) return 'earlier today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 14) return '1 week ago';
  if (diffDays < 28) return `${Math.floor(diffDays / 7)} weeks ago`;

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[date.getMonth()]} ${date.getDate()}`;
}

// ============================================================
// LOD Breadcrumb
// ============================================================

const PER_LEVEL_BUDGET = 2000;
const TOTAL_BUDGET = 8000;

export function lodBreadcrumb(
  breadcrumb: BreadcrumbItem[],
  perLevel = PER_LEVEL_BUDGET,
  total = TOTAL_BUDGET,
): BreadcrumbItem[] {
  if (breadcrumb.length === 0) return [];

  // Step 1: Per-level cap
  const items: BreadcrumbItem[] = breadcrumb.map((item) => ({
    ...item,
    details: item.details ? truncateToBudget(item.details, perLevel) : null,
  }));

  // Step 2: Total budget, truncate from most distant first
  let totalChars = items.reduce((sum, i) => sum + (i.details?.length ?? 0), 0);
  if (totalChars <= total) return items;

  for (let i = 0; i < items.length - 1; i++) {
    if (totalChars <= total) break;
    const currentLen = items[i].details?.length ?? 0;
    if (currentLen === 0) continue;

    // Try first-paragraph truncation
    const truncated = items[i].details ? firstParagraph(items[i].details!) : '';
    if (truncated.length < currentLen) {
      totalChars = totalChars - currentLen + truncated.length;
      items[i].details = truncated || null;
    }

    // If still over, remove entirely
    if (totalChars > total) {
      const removed = items[i].details?.length ?? 0;
      if (removed > 0) {
        totalChars -= removed;
        items[i].details = null;
      }
    }
  }

  return items;
}

function firstParagraph(text: string): string {
  const pos = text.indexOf('\n\n');
  if (pos !== -1) {
    const first = text.slice(0, pos).trim();
    return first.length < text.length ? `${first}...` : first;
  }
  return text;
}

function truncateToBudget(text: string, budget: number): string {
  if (text.length <= budget) return text;

  const searchArea = text.slice(0, budget);
  const paraBreak = searchArea.lastIndexOf('\n\n');
  if (paraBreak !== -1) {
    return `${text.slice(0, paraBreak).trim()}...`;
  }

  const lineBreak = searchArea.lastIndexOf('\n');
  if (lineBreak !== -1) {
    return `${text.slice(0, lineBreak).trim()}...`;
  }

  return `${text.slice(0, Math.max(0, budget - 3))}...`;
}

// ============================================================
// Test Tree Rendering
// ============================================================

interface TestSuiteData {
  name: string;
  file?: string | null;
  tests: TestResultData[];
}

interface TestResultData {
  name: string;
  state: string;
  duration_ms?: number | null;
  message?: string | null;
}

export function renderTestTree(suites: TestSuiteData[]): string {
  let out = '';
  let passed = 0;
  let failed = 0;
  let errored = 0;
  let skipped = 0;

  for (const suite of suites) {
    const header = suite.file ?? suite.name;
    out += `${header}\n`;

    for (const test of suite.tests) {
      switch (test.state) {
        case 'passed': passed++; break;
        case 'failed': failed++; break;
        case 'errored': errored++; break;
        case 'skipped': skipped++; break;
      }
      const sym = testStateSymbol(test.state);
      out += `  ${sym} ${test.name}`;
      if (test.duration_ms != null && test.duration_ms >= 1000) {
        out += ` (${(test.duration_ms / 1000).toFixed(1)}s)`;
      }
      out += '\n';
      if ((test.state === 'failed' || test.state === 'errored') && test.message) {
        for (const line of test.message.split('\n')) {
          out += `    ${line}\n`;
        }
      }
    }
    out += '\n';
  }

  const parts: string[] = [];
  if (passed > 0) parts.push(`${passed} passed`);
  if (failed > 0) parts.push(`${failed} failed`);
  if (errored > 0) parts.push(`${errored} errored`);
  if (skipped > 0) parts.push(`${skipped} skipped`);
  out += parts.join(', ');
  return out;
}

export function renderProofChecklist(suites: TestSuiteData[]): string {
  let out = '';
  let passed = 0;
  let failed = 0;
  let errored = 0;
  let skipped = 0;

  for (const suite of suites) {
    out += `${suite.name}\n`;

    for (const test of suite.tests) {
      switch (test.state) {
        case 'passed': passed++; break;
        case 'failed': failed++; break;
        case 'errored': errored++; break;
        case 'skipped': skipped++; break;
      }
      const sym = testStateSymbol(test.state);
      out += `  ${sym} ${test.name}`;
      if (test.duration_ms != null) {
        if (test.duration_ms >= 1000) {
          out += ` (${(test.duration_ms / 1000).toFixed(1)}s)`;
        } else {
          out += ` (${test.duration_ms}ms)`;
        }
      }
      out += '\n';
      if ((test.state === 'failed' || test.state === 'errored') && test.message) {
        for (const line of test.message.split('\n')) {
          out += `    ${line}\n`;
        }
      }
    }
    out += '\n';
  }

  const parts = [`${passed} passed`, `${failed} failed`];
  if (errored > 0) parts.push(`${errored} errored`);
  if (skipped > 0) parts.push(`${skipped} skipped`);
  out += parts.join(', ');
  return out;
}

// ============================================================
// Activity Timeline
// ============================================================

export function renderActivityTimeline(entries: ProjectHistoryEntry[]): string {
  if (entries.length === 0) {
    return 'No activity recorded yet.';
  }

  let out = '';
  let currentBucket: string | null = null;

  for (const entry of entries) {
    const bucket = timeBucket(entry.created_at);

    if (currentBucket !== bucket) {
      if (currentBucket !== null) out += '\n';
      const label = ` ${bucket} `;
      const padLen = Math.max(0, 48 - label.length - 3);
      out += `\u2500\u2500${label}${'\u2500'.repeat(padLen)}\n\n`;
      currentBucket = bucket;
    }

    // Release entries get special formatting
    if (entry.summary.startsWith('Released ')) {
      const headline = entry.summary.split('\n')[0];
      out += `>>  ${headline.trim()}\n`;
      continue;
    }

    const icon = stateSymbol(entry.feature_state);
    const lines = entry.summary.split('\n');
    const headline = lines[0].trim();
    const rest = lines.slice(1).join('\n').replace(/^\n+/, '').trim();
    const body = rest || null;

    const separator = body ? '\u25b8' : '\u2014';

    // Build commit SHA suffix
    let shaSuffix = '';
    if (entry.commits.length > 0) {
      const shas = entry.commits.map((c) =>
        c.sha.length > 7 ? c.sha.slice(0, 7) : c.sha,
      );
      shaSuffix = `  ${shas.join(', ')}`;
    }

    out += `${icon} ${entry.feature_title} ${separator} ${headline}${shaSuffix}\n`;

    if (body) {
      out += '\n';
      for (const line of body.split('\n')) {
        out += `  ${line}\n`;
      }
      out += '\n';
    }
  }

  return out.trimEnd();
}
