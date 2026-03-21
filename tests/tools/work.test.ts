import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ManifestClient, ApiError, ConflictError, NotFoundError } from '../../src/client.js';
import {
  handleStartFeature,
  handleAssessPlan,
  handleUpdateFeature,
  handleProveFeature,
  handleCompleteFeature,
} from '../../src/tools/work.js';

function createMockClient(): ManifestClient {
  return {
    webUrl: 'http://localhost:4242',
    startFeature: vi.fn(),
    getFeatureContext: vi.fn(),
    updateFeature: vi.fn(),
    proveFeature: vi.fn(),
    completeFeature: vi.fn(),
  } as unknown as ManifestClient;
}

describe('work tools', () => {
  let client: ManifestClient;

  beforeEach(() => {
    client = createMockClient();
  });

  describe('handleStartFeature', () => {
    it('calls client.startFeature and returns spec on success', async () => {
      (client.startFeature as any).mockResolvedValue({
        id: '1',
        title: 'OAuth Login',
        state: 'in_progress',
        details: 'Implement OAuth',
        feature_tier: 'leaf',
        spec_status: 'complete',
        breadcrumb: [],
      });

      const result = await handleStartFeature(client, { feature_id: '1' });
      expect(client.startFeature).toHaveBeenCalledWith('1', {
        agent_type: 'claude',
        force: false,
        claim_metadata: undefined,
      });
      expect(result).toContain('OAuth Login');
    });

    it('includes Web: line when project_slug present', async () => {
      (client.startFeature as any).mockResolvedValue({
        id: '1',
        display_id: 'TST-1',
        title: 'OAuth Login',
        state: 'in_progress',
        details: null,
        project_slug: 'test-project',
        breadcrumb: [],
      });

      const result = await handleStartFeature(client, { feature_id: '1' });
      expect(result).toContain('Web:');
      expect(result).toContain('test-project');
    });

    it('returns error message on claim conflict', async () => {
      (client.startFeature as any).mockRejectedValue(
        new ConflictError('Feature already claimed by claude'),
      );

      const result = await handleStartFeature(client, { feature_id: '1' });
      expect(result).toContain('already claimed');
    });

    it('returns generic API error with status', async () => {
      (client.startFeature as any).mockRejectedValue(
        new ApiError(422, 'Unprocessable Entity', 'Invalid feature'),
      );

      const result = await handleStartFeature(client, { feature_id: '1' });
      expect(result).toContain('Error (422)');
      expect(result).toContain('Invalid feature');
    });
  });

  describe('handleUpdateFeature', () => {
    it('calls client.updateFeature with provided fields', async () => {
      (client.updateFeature as any).mockResolvedValue({
        id: '1',
        title: 'Auth',
        state: 'proposed',
        details: 'Updated details',
      });

      const result = await handleUpdateFeature(client, {
        feature_id: '1',
        details: 'Updated details',
      } as any);
      expect(client.updateFeature).toHaveBeenCalledWith('1', {
        details: 'Updated details',
      });
      expect(result).toContain('Updated');
    });
  });

  describe('handleProveFeature', () => {
    it('calls client.proveFeature with exit_code 0', async () => {
      (client.proveFeature as any).mockResolvedValue({
        id: 'proof-1',
        exit_code: 0,
      });

      const result = await handleProveFeature(client, {
        feature_id: '1',
        command: 'vitest run',
        exit_code: 0,
      });
      expect(client.proveFeature).toHaveBeenCalledWith('1', expect.objectContaining({
        command: 'vitest run',
        exit_code: 0,
      }));
      expect(result).toContain('PASS');
      expect(result).toContain('exit_code: 0');
    });

    it('formats FAIL for exit code 1', async () => {
      (client.proveFeature as any).mockResolvedValue({
        id: 'proof-1',
        exit_code: 1,
      });

      const result = await handleProveFeature(client, {
        feature_id: '1',
        command: 'vitest run',
        exit_code: 1,
      });
      expect(result).toContain('FAIL');
      expect(result).toContain('exit_code: 1');
    });
  });

  describe('handleCompleteFeature', () => {
    it('calls client.completeFeature with summary and commits', async () => {
      (client.completeFeature as any).mockResolvedValue({
        id: '1',
        state: 'implemented',
      });

      const result = await handleCompleteFeature(client, {
        feature_id: '1',
        summary: 'Implemented OAuth login',
        commits: ['abc1234'],
      });
      expect(client.completeFeature).toHaveBeenCalledWith('1', {
        summary: 'Implemented OAuth login',
        commits: ['abc1234'],
        backfill: false,
      });
      expect(result).toContain('implemented');
    });
  });

  describe('handleAssessPlan', () => {
    it('grades a medium plan as tracked', async () => {
      (client.getFeatureContext as any).mockResolvedValue({
        id: '1',
        display_id: 'MAN-1',
        title: 'OAuth Login',
        details: `As a user, I can sign in.\n\n- [ ] Accept valid credentials\n- [ ] Reject invalid credentials\n- [ ] Show an auth error`,
      });

      const result = await handleAssessPlan(client, {
        feature_id: '1',
        plan: 'Plan:\n1. Add auth tests\n2. Update the sign-in handler\n3. Record proof and completion state',
      });

      expect(result).toContain('Plan assessment: tracked');
      expect(result).toContain('Steps: 3');
    });
  });
});
