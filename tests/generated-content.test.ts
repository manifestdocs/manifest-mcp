import { describe, expect, it } from 'vitest';
import { MANIFEST_INSTRUCTIONS } from '../src/generated/instructions.js';

describe('generated MCP instructions', () => {
  it('includes the shared canonical sections', () => {
    expect(MANIFEST_INSTRUCTIONS).toContain('Manifest is living documentation');
    expect(MANIFEST_INSTRUCTIONS).toContain('## Domain terms');
    expect(MANIFEST_INSTRUCTIONS).toContain('## Spec Format');
    expect(MANIFEST_INSTRUCTIONS).toContain('## Output rules');
  });
});
