import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ManifestClient, NotFoundError, ApiError, ConnectionError } from '../src/client.js';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function jsonResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  } as Response;
}

function errorResponse(status: number, body: string): Response {
  return {
    ok: false,
    status,
    statusText: 'Error',
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(body),
  } as Response;
}

describe('ManifestClient', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe('constructor', () => {
    it('defaults baseUrl to localhost:4242', () => {
      const client = new ManifestClient();
      mockFetch.mockResolvedValueOnce(jsonResponse([]));
      client.listProjects();
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:4242/api/v1/projects',
        expect.any(Object),
      );
    });

    it('accepts custom baseUrl', () => {
      const client = new ManifestClient({ baseUrl: 'http://example.com:8080' });
      mockFetch.mockResolvedValueOnce(jsonResponse([]));
      client.listProjects();
      expect(mockFetch).toHaveBeenCalledWith(
        'http://example.com:8080/api/v1/projects',
        expect.any(Object),
      );
    });

    it('strips trailing slash from baseUrl', () => {
      const client = new ManifestClient({ baseUrl: 'http://example.com:8080/' });
      mockFetch.mockResolvedValueOnce(jsonResponse([]));
      client.listProjects();
      expect(mockFetch).toHaveBeenCalledWith(
        'http://example.com:8080/api/v1/projects',
        expect.any(Object),
      );
    });
  });

  describe('GET requests', () => {
    const client = new ManifestClient();

    it('parses JSON response', async () => {
      const data = [{ id: '123', name: 'Test' }];
      mockFetch.mockResolvedValueOnce(jsonResponse(data));
      const result = await client.listProjects();
      expect(result).toEqual(data);
    });

    it('throws NotFoundError on 404', async () => {
      mockFetch.mockResolvedValueOnce(errorResponse(404, 'Not found'));
      await expect(client.getFeature('bad-id')).rejects.toThrow(NotFoundError);
    });

    it('throws ApiError on 500', async () => {
      mockFetch.mockResolvedValueOnce(errorResponse(500, 'Internal error'));
      await expect(client.listProjects()).rejects.toThrow(ApiError);
    });

    it('includes auth header when apiKey provided', async () => {
      const authed = new ManifestClient({ apiKey: 'test-key-123' });
      mockFetch.mockResolvedValueOnce(jsonResponse([]));
      await authed.listProjects();
      const [, opts] = mockFetch.mock.calls[0];
      expect(opts.headers['Authorization']).toBe('Bearer test-key-123');
    });
  });

  describe('POST requests', () => {
    const client = new ManifestClient();

    it('sends JSON body with Content-Type header', async () => {
      const body = { title: 'New Feature' };
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: '1', ...body }));
      await client.createFeature('proj-id', body);
      const [, opts] = mockFetch.mock.calls[0];
      expect(opts.method).toBe('POST');
      expect(opts.headers['Content-Type']).toBe('application/json');
      expect(JSON.parse(opts.body)).toEqual(body);
    });
  });

  describe('connection errors', () => {
    const client = new ManifestClient();

    it('throws ConnectionError when fetch fails', async () => {
      mockFetch.mockRejectedValueOnce(new TypeError('fetch failed'));
      await expect(client.listProjects()).rejects.toThrow(ConnectionError);
    });
  });

  describe('endpoint methods', () => {
    const client = new ManifestClient();

    it('calls GET /projects for listProjects', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse([]));
      await client.listProjects();
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:4242/api/v1/projects',
        expect.objectContaining({ method: 'GET' }),
      );
    });

    it('calls GET /projects?directory= with path query param', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ project: {}, directories: [] }));
      await client.listProjectsByDirectory('/my/path');
      const url = mockFetch.mock.calls[0][0];
      expect(url).toContain('/projects?directory=');
      expect(url).toContain(encodeURIComponent('/my/path'));
    });

    it('calls GET /features/{id}/context for getFeatureContext', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: '123' }));
      await client.getFeatureContext('123');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:4242/api/v1/features/123/context',
        expect.objectContaining({ method: 'GET' }),
      );
    });

    it('calls GET /features/{id} for getFeature', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: '123' }));
      await client.getFeature('123');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:4242/api/v1/features/123',
        expect.objectContaining({ method: 'GET' }),
      );
    });

    it('calls PUT /features/{id}/claim for startFeature', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: '123' }));
      await client.startFeature('123', { agent_type: 'pi' });
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe('http://localhost:4242/api/v1/features/123/claim');
      expect(opts.method).toBe('PUT');
    });

    it('calls POST /features/{id}/complete for completeFeature', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: '123' }));
      await client.completeFeature('123', { summary: 'Done', commits: [] });
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe('http://localhost:4242/api/v1/features/123/complete');
      expect(opts.method).toBe('POST');
    });

    it('calls POST /features/{id}/proofs for proveFeature', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: '123' }));
      await client.proveFeature('123', {
        command: 'vitest run',
        exit_code: 0,
      });
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe('http://localhost:4242/api/v1/features/123/proofs');
      expect(opts.method).toBe('POST');
    });

    it('calls POST /projects/{id}/features for createFeature', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: 'new' }));
      await client.createFeature('proj-1', { title: 'New' });
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe('http://localhost:4242/api/v1/projects/proj-1/features');
      expect(opts.method).toBe('POST');
    });

    it('calls PUT /features/{id} for updateFeature', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: '123' }));
      await client.updateFeature('123', { details: 'Updated' });
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe('http://localhost:4242/api/v1/features/123');
      expect(opts.method).toBe('PUT');
    });

    it('calls GET /projects/{id}/features?format=tree for getFeatureTree', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse([]));
      await client.getFeatureTree('proj-1');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:4242/api/v1/projects/proj-1/features?format=tree',
        expect.objectContaining({ method: 'GET' }),
      );
    });

    it('calls GET /projects/{id}/features?state=proposed for findFeatures', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse([]));
      await client.findFeatures({ project_id: 'proj-1', state: 'proposed' });
      const url = mockFetch.mock.calls[0][0];
      expect(url).toContain('/projects/proj-1/features');
      expect(url).toContain('state=proposed');
    });

    it('calls GET /projects/{id}/versions for listVersions', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ versions: [] }));
      await client.listVersions('proj-1');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:4242/api/v1/projects/proj-1/versions',
        expect.objectContaining({ method: 'GET' }),
      );
    });

    it('calls GET /features/{id}/history for getFeatureHistory', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse([]));
      await client.getFeatureHistory('feat-1');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:4242/api/v1/features/feat-1/history',
        expect.objectContaining({ method: 'GET' }),
      );
    });

    it('calls GET /projects/{id}/features?next=true for getNextFeature', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: '1' }));
      await client.getNextFeature('proj-1');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:4242/api/v1/projects/proj-1/features?next=true',
        expect.objectContaining({ method: 'GET' }),
      );
    });

    it('calls DELETE /features/{id} for deleteFeature', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        statusText: 'No Content',
        text: () => Promise.resolve(''),
      } as Response);
      await client.deleteFeature('feat-1');
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe('http://localhost:4242/api/v1/features/feat-1');
      expect(opts.method).toBe('DELETE');
    });

    it('calls POST /projects/{id}/versions for createVersion', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: 'v1' }));
      await client.createVersion('proj-1', { name: '0.1.0' });
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe('http://localhost:4242/api/v1/projects/proj-1/versions');
      expect(opts.method).toBe('POST');
    });

    it('calls PUT /features/{id}/version for setFeatureVersion', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({}));
      await client.setFeatureVersion('feat-1', 'ver-1');
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe('http://localhost:4242/api/v1/features/feat-1/version');
      expect(opts.method).toBe('PUT');
    });

    it('calls PUT /versions/{id} with released_at for releaseVersion', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({}));
      await client.releaseVersion('ver-1');
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe('http://localhost:4242/api/v1/versions/ver-1');
      expect(opts.method).toBe('PUT');
      const body = JSON.parse(opts.body);
      expect(body.released_at).toBeDefined();
    });

    it('calls GET /projects/{id}/history for getProjectHistory', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse([]));
      await client.getProjectHistory('proj-1');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:4242/api/v1/projects/proj-1/history',
        expect.objectContaining({ method: 'GET' }),
      );
    });

    it('calls GET /features/{id}/proofs?latest=true for getFeatureProof', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({}));
      await client.getFeatureProof('feat-1');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:4242/api/v1/features/feat-1/proofs?latest=true',
        expect.objectContaining({ method: 'GET' }),
      );
    });

    it('calls POST /projects for initProject', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: 'proj-1' }));
      await client.initProject({ directory_path: '/my/path' });
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe('http://localhost:4242/api/v1/projects');
      expect(opts.method).toBe('POST');
    });

    it('calls POST /projects/{id}/directories for addProjectDirectory', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: 'dir-1' }));
      await client.addProjectDirectory('proj-1', { path: '/new/path' });
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe('http://localhost:4242/api/v1/projects/proj-1/directories');
      expect(opts.method).toBe('POST');
    });

    it('calls POST /projects/{id}/features for planFeatures', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ proposed_features: [] }));
      await client.planFeatures('proj-1', { features: [], confirm: false });
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe('http://localhost:4242/api/v1/projects/proj-1/features');
      expect(opts.method).toBe('POST');
    });

    it('calls POST /features/{id}/verify for verifyFeature', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({}));
      await client.verifyFeature('feat-1');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:4242/api/v1/features/feat-1/verify',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('calls PUT /features/{id}/verification for recordVerification', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({}));
      await client.recordVerification('feat-1', { comments: [] });
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe('http://localhost:4242/api/v1/features/feat-1/verification');
      expect(opts.method).toBe('PUT');
    });

});
});
