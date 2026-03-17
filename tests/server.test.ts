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

  it('registers all 26 tools', async () => {
    const { client } = await createConnectedPair();
    const { tools } = await client.listTools();
    expect(tools.length).toBe(26);

    const names = tools.map((t) => t.name).sort();
    expect(names).toContain('manifest_list_projects');
    expect(names).toContain('manifest_find_features');
    expect(names).toContain('manifest_get_feature');

    expect(names).toContain('manifest_get_next_feature');
    expect(names).toContain('manifest_render_feature_tree');
    expect(names).toContain('manifest_orient');
    expect(names).toContain('manifest_start_feature');
    expect(names).toContain('manifest_update_feature');
    expect(names).toContain('manifest_prove_feature');
    expect(names).toContain('manifest_complete_feature');
    expect(names).toContain('manifest_init_project');
    expect(names).toContain('manifest_add_project_directory');
    expect(names).toContain('manifest_create_feature');
    expect(names).toContain('manifest_delete_feature');
    expect(names).toContain('manifest_decompose');
    expect(names).toContain('manifest_get_project_instructions');
    expect(names).toContain('manifest_get_project_history');
    expect(names).toContain('manifest_generate_feature_tree');
    expect(names).toContain('manifest_sync');
    expect(names).toContain('manifest_list_versions');
    expect(names).toContain('manifest_create_version');
    expect(names).toContain('manifest_set_feature_version');
    expect(names).toContain('manifest_release_version');
    expect(names).toContain('manifest_verify_feature');
    expect(names).toContain('manifest_record_verification');
    expect(names).toContain('manifest_get_feature_proof');
  });

  it('round-trips manifest_list_projects', async () => {
    const { client } = await createConnectedPair();
    const projects = [{ id: 'p1', name: 'Test Project', description: 'A test' }];
    mockFetch.mockResolvedValueOnce(jsonResponse(projects));

    const result = await client.callTool({
      name: 'manifest_list_projects',
      arguments: {},
    });

    expect(result.content).toHaveLength(1);
    const text = (result.content as any[])[0].text;
    expect(text).toContain('Test Project');
    expect(text).toContain('p1');
  });

  it('round-trips manifest_get_feature', async () => {
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
      name: 'manifest_get_feature',
      arguments: { feature_id: 'f1' },
    });

    const text = (result.content as any[])[0].text;
    expect(text).toContain('Authentication');
    expect(text).toContain('proposed');
  });
});
