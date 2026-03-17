import { describe, it, expect } from 'vitest';
import {
  stateSymbol,
  displayId,
  renderTree,
  filterTree,
  markdownTable,
  timeBucket,
  lodBreadcrumb,
  testStateSymbol,
  renderTestTree,
  renderProofChecklist,
  renderActivityTimeline,
} from '../src/format.js';
import type { FeatureTreeNode, BreadcrumbItem, ProjectHistoryEntry } from '../src/types.js';

describe('format', () => {
  describe('stateSymbol', () => {
    it('maps proposed to diamond', () => {
      expect(stateSymbol('proposed')).toBe('\u25c7');
    });

    it('maps blocked to circle-minus', () => {
      expect(stateSymbol('blocked')).toBe('\u2298');
    });

    it('maps in_progress to open circle', () => {
      expect(stateSymbol('in_progress')).toBe('\u25cb');
    });

    it('maps implemented to filled circle', () => {
      expect(stateSymbol('implemented')).toBe('\u25cf');
    });

    it('maps archived to cross', () => {
      expect(stateSymbol('archived')).toBe('\u2717');
    });

    it('maps unknown to question mark', () => {
      expect(stateSymbol('unknown')).toBe('?');
    });
  });

  describe('testStateSymbol', () => {
    it('maps passed to checkmark', () => {
      expect(testStateSymbol('passed')).toBe('\u2713');
    });

    it('maps failed to cross', () => {
      expect(testStateSymbol('failed')).toBe('\u2717');
    });

    it('maps errored to exclamation', () => {
      expect(testStateSymbol('errored')).toBe('!');
    });

    it('maps skipped to circle-minus', () => {
      expect(testStateSymbol('skipped')).toBe('\u2298');
    });
  });

  describe('displayId', () => {
    it('formats MAN-42 from prefix and number', () => {
      expect(displayId(42, 'MAN')).toBe('MAN-42');
    });

    it('falls back to short UUID when no number', () => {
      expect(displayId(null, 'MAN', '550e8400-e29b-41d4-a716-446655440000')).toBe('550e8400');
    });

    it('falls back to short UUID when no prefix', () => {
      expect(displayId(42, '', '550e8400-e29b-41d4-a716-446655440000')).toBe('550e8400');
    });
  });

  describe('renderTree', () => {
    function makeNode(
      title: string,
      state: string,
      children: FeatureTreeNode[] = [],
      opts?: { feature_number?: number; is_root?: boolean },
    ): FeatureTreeNode {
      return {
        id: '00000000-0000-0000-0000-000000000000',
        project_id: '00000000-0000-0000-0000-000000000001',
        title,
        state: state as any,
        priority: 0,
        feature_number: opts?.feature_number ?? null,
        created_at: '',
        updated_at: '',
        children,
        is_root: opts?.is_root,
      };
    }

    it('renders single leaf root node with state symbol', () => {
      const tree = [makeNode('Authentication', 'proposed')];
      expect(renderTree(tree, 0, '')).toBe('\u25c7 Authentication\n');
    });

    it('renders nested children — only leaves show state', () => {
      const tree = [
        makeNode('Auth', 'proposed', [
          makeNode('Password Login', 'implemented'),
          makeNode('OAuth', 'in_progress'),
        ]),
      ];
      const output = renderTree(tree, 0, '');
      // Parent node has no state symbol
      expect(output).toContain('Auth\n');
      expect(output).not.toContain('\u25c7 Auth');
      // Leaf children show state
      expect(output).toContain('\u251c\u2500\u2500 \u25cf Password Login');
      expect(output).toContain('\u2514\u2500\u2500 \u25cb OAuth');
    });

    it('shows state symbols only on leaf nodes', () => {
      const tree = [makeNode('Root', 'proposed', [
        makeNode('A', 'implemented'),
        makeNode('B', 'blocked'),
        makeNode('C', 'archived'),
      ])];
      const output = renderTree(tree, 0, '');
      expect(output).toContain('\u25cf A');
      expect(output).toContain('\u2298 B');
      expect(output).toContain('\u2717 C');
      // Root (parent) has no state symbol
      expect(output).not.toContain('\u25c7 Root');
    });

    it('respects maxDepth', () => {
      const tree = [
        makeNode('Auth', 'proposed', [
          makeNode('Login', 'implemented'),
          makeNode('OAuth', 'in_progress', [
            makeNode('Google', 'proposed'),
          ]),
        ]),
      ];
      const output = renderTree(tree, 1, '');
      expect(output).toContain('(...)');
      expect(output).not.toContain('Google');
    });

    it('renders display IDs when key_prefix provided', () => {
      const tree = [
        makeNode('Auth', 'proposed', [
          makeNode('Login', 'implemented', [], { feature_number: 2 }),
          makeNode('OAuth', 'in_progress', [], { feature_number: 3 }),
        ], { feature_number: 1 }),
      ];
      const output = renderTree(tree, 0, 'MAN');
      expect(output).toContain('MAN-1 Auth');
      expect(output).toContain('\u25cf MAN-2 Login');  // leaf — symbol before ID
      expect(output).toContain('\u25cb MAN-3 OAuth');  // leaf — symbol before ID
    });

    it('shows project root symbol', () => {
      const tree = [makeNode('My Project', 'proposed', [], { is_root: true })];
      const output = renderTree(tree, 0, '');
      expect(output).toContain('\u25a3 My Project');
    });
  });

  describe('filterTree', () => {
    function makeNode(
      title: string,
      state: string,
      children: FeatureTreeNode[] = [],
    ): FeatureTreeNode {
      return {
        id: '00000000-0000-0000-0000-000000000000',
        project_id: '00000000-0000-0000-0000-000000000001',
        title,
        state: state as any,
        priority: 0,
        feature_number: null,
        created_at: '',
        updated_at: '',
        children,
      };
    }

    it('keeps only leaves matching the predicate', () => {
      const tree = [
        makeNode('Auth', 'proposed', [
          makeNode('Login', 'proposed'),
          makeNode('OAuth', 'implemented'),
        ]),
      ];
      const filtered = filterTree(tree, (n) => n.state === 'proposed');
      expect(filtered).toHaveLength(1);
      expect(filtered[0].children).toHaveLength(1);
      expect(filtered[0].children[0].title).toBe('Login');
    });

    it('removes branches with no matching leaves', () => {
      const tree = [
        makeNode('Auth', 'proposed', [
          makeNode('Login', 'implemented'),
          makeNode('OAuth', 'implemented'),
        ]),
      ];
      const filtered = filterTree(tree, (n) => n.state === 'proposed');
      expect(filtered).toHaveLength(0);
    });

    it('preserves parent structure for matching descendants', () => {
      const tree = [
        makeNode('Root', 'proposed', [
          makeNode('Group', 'proposed', [
            makeNode('Deep Leaf', 'proposed'),
          ]),
          makeNode('Other', 'implemented'),
        ]),
      ];
      const filtered = filterTree(tree, (n) => n.state === 'proposed');
      expect(filtered).toHaveLength(1);
      expect(filtered[0].children).toHaveLength(1);
      expect(filtered[0].children[0].title).toBe('Group');
      expect(filtered[0].children[0].children).toHaveLength(1);
      expect(filtered[0].children[0].children[0].title).toBe('Deep Leaf');
    });

    it('returns empty for no matches', () => {
      const tree = [makeNode('Leaf', 'implemented')];
      const filtered = filterTree(tree, (n) => n.state === 'proposed');
      expect(filtered).toHaveLength(0);
    });
  });

  describe('markdownTable', () => {
    it('aligns columns', () => {
      const table = markdownTable(
        ['ID', 'Name', 'Status'],
        [
          ['abc12345', 'Auth', 'proposed'],
          ['def67890', 'Router', 'implemented'],
        ],
      );
      expect(table).toContain('| ID       |');
      expect(table).toContain('| abc12345 |');
      const lines = table.split('\n').filter(Boolean);
      expect(lines.length).toBe(4);
    });

    it('handles empty data', () => {
      expect(markdownTable(['A', 'B'], [])).toBe('(none)');
    });
  });

  describe('timeBucket', () => {
    it('shows "just now" for < 1 minute', () => {
      const now = new Date();
      expect(timeBucket(now.toISOString())).toBe('just now');
    });

    it('shows "15 mins ago" for recent', () => {
      const d = new Date(Date.now() - 10 * 60 * 1000);
      expect(timeBucket(d.toISOString())).toBe('15 mins ago');
    });

    it('shows "yesterday" for 1 day ago', () => {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      d.setHours(12, 0, 0, 0);
      expect(timeBucket(d.toISOString())).toBe('yesterday');
    });
  });

  describe('lodBreadcrumb', () => {
    it('preserves short details', () => {
      const breadcrumb: BreadcrumbItem[] = [
        { id: '1', title: 'Root', details: 'Root details' },
        { id: '2', title: 'Current', details: 'Current details' },
      ];
      const result = lodBreadcrumb(breadcrumb);
      expect(result[0].details).toBe('Root details');
      expect(result[1].details).toBe('Current details');
    });

    it('truncates long details per level', () => {
      const breadcrumb: BreadcrumbItem[] = [
        { id: '1', title: 'Root', details: 'x'.repeat(3000) },
        { id: '2', title: 'Current', details: null },
      ];
      const result = lodBreadcrumb(breadcrumb);
      expect(result[0].details!.length).toBeLessThanOrEqual(2003);
    });

    it('handles empty breadcrumb', () => {
      expect(lodBreadcrumb([])).toEqual([]);
    });
  });

  describe('renderTestTree', () => {
    it('renders test results with symbols', () => {
      const output = renderTestTree([
        {
          name: 'auth_spec',
          file: 'tests/auth_spec.rs',
          tests: [
            { name: 'creates a user', state: 'passed' },
            { name: 'rejects bad password', state: 'failed', message: 'assertion failed' },
          ],
        },
      ]);
      expect(output).toContain('\u2713 creates a user');
      expect(output).toContain('\u2717 rejects bad password');
      expect(output).toContain('assertion failed');
      expect(output).toContain('1 passed, 1 failed');
    });
  });

  describe('renderProofChecklist', () => {
    it('renders with suite names and durations', () => {
      const output = renderProofChecklist([
        {
          name: 'Store Inventory',
          tests: [
            { name: 'returns counts', state: 'passed', duration_ms: 12 },
            { name: 'handles updates', state: 'passed', duration_ms: 8 },
          ],
        },
      ]);
      expect(output).toContain('Store Inventory');
      expect(output).toContain('(12ms)');
      expect(output).toContain('2 passed, 0 failed');
    });
  });

  describe('renderActivityTimeline', () => {
    it('returns empty message for no entries', () => {
      expect(renderActivityTimeline([])).toBe('No activity recorded yet.');
    });

    it('renders release entries with special formatting', () => {
      const entries: ProjectHistoryEntry[] = [
        {
          feature_title: '',
          feature_state: 'implemented',
          summary: 'Released v0.2.0',
          commits: [],
          created_at: new Date().toISOString(),
        },
      ];
      const output = renderActivityTimeline(entries);
      expect(output).toContain('>> ');
      expect(output).toContain('Released v0.2.0');
    });
  });
});
