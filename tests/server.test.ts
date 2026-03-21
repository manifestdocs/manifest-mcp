import { describe, it, expect, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../src/server.js';

// Mock fetch globally so the ManifestClient doesn't hit a real server
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function jsonResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: 'OK',
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  } as Response;
}

describe('MCP Server', () => {
  async function createConnectedPair() {
    const server = createServer({ baseUrl: 'http://test:5173' });
    const client = new Client({ name: 'test-client', version: '1.0.0' });

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);

    return { server, client };
  }

  it('registers all 25 tools', async () => {
    const { client } = await createConnectedPair();
    const { tools } = await client.listTools();
    expect(tools.length).toBe(25);

    const names = tools.map((t) => t.name).sort();
    expect(names).toContain('list_projects');
    expect(names).toContain('find_features');
    expect(names).toContain('get_feature');

    expect(names).toContain('get_next_feature');
    expect(names).toContain('render_feature_tree');
    expect(names).toContain('orient');
    expect(names).toContain('start_feature');
    expect(names).toContain('assess_plan');
    expect(names).toContain('update_feature');
    expect(names).toContain('prove_feature');
    expect(names).toContain('complete_feature');
    expect(names).toContain('init_project');
    expect(names).toContain('add_project_directory');
    expect(names).toContain('create_feature');
    expect(names).toContain('delete_feature');
    expect(names).toContain('decompose');
    expect(names).toContain('get_project_history');
    expect(names).toContain('sync');
    expect(names).toContain('list_versions');
    expect(names).toContain('create_version');
    expect(names).toContain('set_feature_version');
    expect(names).toContain('release_version');
    expect(names).toContain('verify_feature');
    expect(names).toContain('record_verification');
    expect(names).toContain('get_feature_proof');
  });

  it('describes post-completion explanation guidance on complete_feature', async () => {
    const { client } = await createConnectedPair();
    const { tools } = await client.listTools();

    const completeTool = tools.find((tool) => tool.name === 'complete_feature');
    expect(completeTool?.description).toContain(
      'The server validates proof and spec update requirements.',
    );
  });

  it('round-trips list_projects', async () => {
    const { client } = await createConnectedPair();
    const projects = [{ id: 'p1', name: 'Test Project', description: 'A test' }];
    mockFetch.mockResolvedValueOnce(jsonResponse(projects));

    const result = await client.callTool({
      name: 'list_projects',
      arguments: {},
    });

    expect(result.content).toHaveLength(1);
    const text = (result.content as any[])[0].text;
    expect(text).toContain('Test Project');
    expect(text).toContain('p1');
  });

  it('round-trips get_feature', async () => {
    const { client } = await createConnectedPair();
    mockFetch.mockResolvedValueOnce(jsonResponse({
      id: 'f1',
      display_id: 'MAN-1',
      title: 'Authentication',
      state: 'proposed',
      priority: 1,
      breadcrumb: [],
      children: [],
      siblings: [],
    }));

    const result = await client.callTool({
      name: 'get_feature',
      arguments: { feature_id: 'f1' },
    });

    const text = (result.content as any[])[0].text;
    expect(text).toContain('Authentication');
    expect(text).toContain('proposed');
  });

  it('round-trips assess_plan', async () => {
    const { client } = await createConnectedPair();
    mockFetch.mockResolvedValueOnce(jsonResponse({
      id: 'f1',
      display_id: 'MAN-1',
      title: 'Authentication',
      details: `As a user, I can sign in.

- [ ] Accept valid credentials
- [ ] Reject invalid credentials
- [ ] Show an auth error`,
      state: 'in_progress',
      priority: 1,
      breadcrumb: [],
      children: [],
      siblings: [],
    }));

    const result = await client.callTool({
      name: 'assess_plan',
      arguments: {
        feature_id: 'f1',
        plan: 'Plan:\n1. Add sign-in tests\n2. Update the auth handler\n3. Record proof and completion state',
      },
    });

    const text = (result.content as any[])[0].text;
    expect(text).toContain('Plan assessment: tracked');
    expect(text).toContain('Feature: MAN-1 Authentication');
    expect(text).toContain('Steps: 3');
    expect(text).toContain('Unchecked acceptance criteria: 3');
  });
});
