import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ManifestClient, ApiError, ConflictError, ConnectionError, NotFoundError } from '../../src/client.js';
import {
  handleListProjects,
  handleFindFeatures,
  handleGetFeature,
  handleGetNextFeature,
  handleRenderFeatureTree,
  handleOrient,
} from '../../src/tools/discovery.js';

function createMockClient(): ManifestClient {
  return {
    webUrl: 'http://localhost:4242',
    listProjectsByDirectory: vi.fn(),
    listProjects: vi.fn(),
    findFeatures: vi.fn(),
    getFeature: vi.fn(),
    getFeatureContext: vi.fn(),
    getFeatureHistory: vi.fn(),
    getFeatureTree: vi.fn(),
    getProject: vi.fn(),
    getNextFeature: vi.fn(),
    getProjectHistory: vi.fn(),
  } as unknown as ManifestClient;
}

describe('discovery tools', () => {
  let client: ManifestClient;

  beforeEach(() => {
    client = createMockClient();
  });

  describe('handleListProjects', () => {
    it('calls listProjectsByDirectory when directory_path provided', async () => {
      const mockResp = {
        project: { id: '1', name: 'Test', key_prefix: 'TST' },
        directories: [],
      };
      (client.listProjectsByDirectory as any).mockResolvedValue(mockResp);

      const result = await handleListProjects(client, { directory_path: '/my/path' });
      expect(client.listProjectsByDirectory).toHaveBeenCalledWith('/my/path');
      expect(result).toContain('Test');
    });

    it('calls listProjects when no directory_path', async () => {
      (client.listProjects as any).mockResolvedValue([
        { id: '1', name: 'P1', key_prefix: 'P1' },
        { id: '2', name: 'P2', key_prefix: 'P2' },
      ]);

      const result = await handleListProjects(client, {});
      expect(client.listProjects).toHaveBeenCalled();
      expect(result).toContain('P1');
      expect(result).toContain('P2');
    });

    it('returns connection error message when server is down', async () => {
      (client.listProjects as any).mockRejectedValue(
        new ConnectionError('http://localhost:4242'),
      );

      const result = await handleListProjects(client, {});
      expect(result).toContain('Cannot connect to Manifest server');
    });

    it('returns API error message on server error', async () => {
      (client.listProjects as any).mockRejectedValue(
        new ApiError(500, 'Internal Server Error', 'something broke'),
      );

      const result = await handleListProjects(client, {});
      expect(result).toContain('Error (500)');
      expect(result).toContain('something broke');
    });
  });

  describe('handleFindFeatures', () => {
    it('calls client.findFeatures with params', async () => {
      (client.findFeatures as any).mockResolvedValue([
        { id: '1', title: 'Auth', state: 'proposed', priority: 0 },
      ]);

      const result = await handleFindFeatures(client, {
        project_id: 'proj-1',
        state: 'proposed',
      });
      expect(client.findFeatures).toHaveBeenCalledWith({
        project_id: 'proj-1',
        state: 'proposed',
        limit: 50,
      });
      expect(result).toContain('Auth');
    });

    it('returns connection error when server is down', async () => {
      (client.findFeatures as any).mockRejectedValue(
        new ConnectionError('http://localhost:4242'),
      );

      const result = await handleFindFeatures(client, { project_id: 'proj-1' });
      expect(result).toContain('Cannot connect to Manifest server');
    });
  });

  describe('handleGetFeature', () => {
    it('card view includes Web: line when project_slug present', async () => {
      (client.getFeatureContext as any).mockResolvedValue({
        id: '1',
        display_id: 'TST-1',
        title: 'OAuth Login',
        state: 'proposed',
        details: 'Login via OAuth',
        desired_details: null,
        priority: 0,
        project_slug: 'test-project',
        breadcrumb: [],
        parent: null,
        siblings: [],
        children: [],
      });

      const result = await handleGetFeature(client, { feature_id: '1', view: 'card' });
      expect(result).toContain('Web:');
      expect(result).toContain('test-project');
      expect(result).toContain('TST-1');
    });

    it('full view includes Web: line when project_slug present', async () => {
      (client.getFeatureContext as any).mockResolvedValue({
        id: '1',
        display_id: 'TST-1',
        title: 'OAuth Login',
        state: 'proposed',
        details: null,
        desired_details: null,
        priority: 0,
        project_slug: 'test-project',
        breadcrumb: [],
        parent: null,
        siblings: [],
        children: [],
      });

      const result = await handleGetFeature(client, { feature_id: '1', view: 'full' });
      expect(result).toContain('Web:');
      expect(result).toContain('test-project');
    });

    it('returns API error on failure', async () => {
      (client.getFeatureContext as any).mockRejectedValue(
        new ApiError(404, 'Not Found', 'Feature not found'),
      );

      const result = await handleGetFeature(client, { feature_id: 'bad-id' });
      expect(result).toContain('Error (404)');
    });
  });

  describe('handleGetNextFeature', () => {
    it('calls client.getNextFeature', async () => {
      (client.getNextFeature as any).mockResolvedValue({
        id: '1',
        title: 'Next Feature',
        state: 'proposed',
        priority: 0,
        breadcrumb: [],
        siblings: [],
        children: [],
      });

      const result = await handleGetNextFeature(client, { project_id: 'proj-1' });
      expect(client.getNextFeature).toHaveBeenCalledWith('proj-1', undefined);
      expect(result).toContain('Next Feature');
    });

    it('returns friendly message when getNextFeature throws NotFoundError', async () => {
      (client.getNextFeature as any).mockRejectedValue(
        new NotFoundError('No workable features'),
      );

      const result = await handleGetNextFeature(client, { project_id: 'proj-1' });
      expect(result).toContain('No workable features');
    });

    it('formats stale features on ConflictError', async () => {
      const conflictBody = JSON.stringify({
        error: 'in_progress_features_exist',
        message: 'There are features in progress',
        features: [
          {
            id: 'f1',
            title: 'Stale Feature',
            state: 'in_progress',
            priority: 0,
            proof_status: null,
            completable: false,
          },
        ],
      });
      (client.getNextFeature as any).mockRejectedValue(
        new ConflictError(conflictBody),
      );

      const result = await handleGetNextFeature(client, { project_id: 'proj-1' });
      expect(result).toContain('still in progress');
      expect(result).toContain('Stale Feature');
    });

    it('returns "No project found" when directory lookup fails', async () => {
      (client.listProjectsByDirectory as any).mockRejectedValue(
        new NotFoundError('{"error":"Project not found"}'),
      );

      const result = await handleGetNextFeature(client, { directory_path: '/bad/dir' });
      expect(result).toContain('No project found');
    });
  });

  describe('handleRenderFeatureTree', () => {
    it('calls client.getFeatureTree and renders ASCII tree', async () => {
      (client.getFeatureTree as any).mockResolvedValue([
        {
          id: '1',
          title: 'Auth',
          state: 'proposed',
          priority: 0,
          children: [
            {
              id: '2',
              title: 'Login',
              state: 'implemented',
              priority: 0,
              children: [],
            },
          ],
        },
      ]);
      (client.getProject as any).mockResolvedValue({
        id: 'proj-1',
        name: 'Test',
        key_prefix: 'TST',
      });

      const result = await handleRenderFeatureTree(client, {
        project_id: 'proj-1',
        max_depth: 0,
      });
      expect(client.getFeatureTree).toHaveBeenCalledWith('proj-1');
      expect(result).toContain('Auth');
      expect(result).toContain('Login');
    });

    it('returns "No project found" when directory lookup throws NotFoundError', async () => {
      (client.listProjectsByDirectory as any).mockRejectedValue(
        new NotFoundError('{"error":"Project not found"}'),
      );

      const result = await handleRenderFeatureTree(client, { directory_path: '/bad/dir' });
      expect(result).toContain('No project found');
    });

    it('returns connection error when server is down', async () => {
      (client.getFeatureTree as any).mockRejectedValue(
        new ConnectionError('http://localhost:4242'),
      );

      const result = await handleRenderFeatureTree(client, { project_id: 'proj-1' });
      expect(result).toContain('Cannot connect to Manifest server');
    });
  });

  describe('handleOrient', () => {
    it('returns project overview with tree, queue, and history', async () => {
      (client.listProjectsByDirectory as any).mockResolvedValue({
        id: 'proj-1',
        name: 'My Project',
        key_prefix: 'MP',
      });
      (client.getFeatureTree as any).mockResolvedValue([
        { id: '1', title: 'Auth', state: 'proposed', priority: 0, children: [] },
      ]);
      (client.getProject as any).mockResolvedValue({
        id: 'proj-1',
        name: 'My Project',
        key_prefix: 'MP',
      });
      (client.findFeatures as any).mockResolvedValue([
        { id: '3', title: 'Signup', state: 'proposed', priority: 0 },
      ]);
      (client.getProjectHistory as any).mockResolvedValue([
        {
          feature_title: 'Init',
          feature_state: 'implemented',
          summary: 'Project initialized',
          created_at: '2024-01-01T00:00:00Z',
          commits: [],
        },
      ]);

      const result = await handleOrient(client, { directory_path: '/my/project' });
      expect(result).toContain('My Project');
      expect(result).toContain('Auth');
      expect(result).toContain('Signup');
      expect(result).toContain('Project initialized');
    });

    it('returns "No project found" when no params', async () => {
      const result = await handleOrient(client, {});
      expect(result).toContain('No project found');
    });

    it('returns "No project found" when directory lookup throws NotFoundError', async () => {
      (client.listProjectsByDirectory as any).mockRejectedValue(
        new NotFoundError('{"error":"Project not found"}'),
      );

      const result = await handleOrient(client, { directory_path: '/unknown/dir' });
      expect(result).toContain('No project found');
    });

    it('returns connection error when server is down', async () => {
      (client.listProjectsByDirectory as any).mockRejectedValue(
        new ConnectionError('http://localhost:4242'),
      );

      const result = await handleOrient(client, { directory_path: '/my/project' });
      expect(result).toContain('Cannot connect to Manifest server');
    });

    it('works with project_id directly', async () => {
      (client.getFeatureTree as any).mockResolvedValue([]);
      (client.findFeatures as any).mockResolvedValue([]);
      (client.getProjectHistory as any).mockResolvedValue([]);

      const result = await handleOrient(client, { project_id: 'proj-1' });
      expect(result).toContain('proj-1');
    });

    it('returns bootstrap guidance for empty projects', async () => {
      (client.listProjectsByDirectory as any).mockResolvedValue({
        id: 'proj-1',
        name: 'Empty Project',
        key_prefix: 'EP',
      });
      (client.getFeatureTree as any).mockResolvedValue([
        { id: 'root-1', title: 'Empty Project', state: 'proposed', priority: 0, is_root: true, children: [] },
      ]);
      (client.findFeatures as any).mockResolvedValue([]);
      (client.getProjectHistory as any).mockResolvedValue([]);

      const result = await handleOrient(client, { directory_path: '/my/project' });
      expect(result).toContain('Empty Project');
      expect(result).toContain('decompose');
      expect(result).toContain('Next Steps');
      expect(result).not.toContain('Feature Tree');
    });

    it('returns normal overview when root has children', async () => {
      (client.listProjectsByDirectory as any).mockResolvedValue({
        id: 'proj-1',
        name: 'Active Project',
        key_prefix: 'AP',
      });
      (client.getFeatureTree as any).mockResolvedValue([
        {
          id: 'root-1',
          title: 'Active Project',
          state: 'proposed',
          priority: 0,
          is_root: true,
          children: [
            { id: 'f1', title: 'Auth', state: 'proposed', priority: 0, children: [] },
          ],
        },
      ]);
      (client.getProject as any).mockResolvedValue({
        id: 'proj-1',
        name: 'Active Project',
        key_prefix: 'AP',
      });
      (client.findFeatures as any).mockResolvedValue([]);
      (client.getProjectHistory as any).mockResolvedValue([]);

      const result = await handleOrient(client, { directory_path: '/my/project' });
      expect(result).toContain('Feature Tree');
      expect(result).not.toContain('Empty Project');
    });
  });
});
