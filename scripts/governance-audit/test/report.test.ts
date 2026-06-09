import { describe, expect, it } from 'vitest';
import { renderMarkdown, summarize } from '../src/report.js';
import { permissionSatisfies } from '../src/checks/teamPermissions.js';
import { sharedWorkflowsCheck } from '../src/checks/sharedWorkflows.js';
import { dockerBaseImageCheck } from '../src/checks/dockerBaseImage.js';
import type { Finding } from '../src/types.js';

const findings: Finding[] = [
  { scope: 'HSLdevcom/a', check: 'shared-workflows', severity: 'ok', message: 'fine' },
  {
    scope: 'HSLdevcom/b',
    check: 'shared-workflows',
    severity: 'drift',
    message: 'ci-cd.yml missing',
  },
  { scope: 'HSLdevcom/c', check: 'docker-base-image', severity: 'exception', message: 'tracked' },
  { scope: 'HSLdevcom/d', check: 'docker-base-image', severity: 'info', message: 'no Dockerfile' },
];

describe('summarize', () => {
  it('counts findings by severity', () => {
    const s = summarize(findings);
    expect(s.total).toBe(4);
    expect(s.drift).toBe(1);
    expect(s.bySeverity.ok).toBe(1);
    expect(s.bySeverity.exception).toBe(1);
  });
});

describe('renderMarkdown', () => {
  it('renders a summary table and per-check sections, escaping pipes', () => {
    const md = renderMarkdown([sharedWorkflowsCheck, dockerBaseImageCheck], findings);
    expect(md).toContain('# HSL Repository Governance');
    expect(md).toContain('Shared-workflows migration compliance');
    expect(md).toContain('HSLdevcom/b');
    // compliant rows are tucked into a <details> block
    expect(md).toContain('<details><summary>Compliant repositories</summary>');
  });
});

describe('permissionSatisfies', () => {
  it('treats a higher permission as satisfying a lower requirement', () => {
    expect(permissionSatisfies('admin', 'maintain')).toBe(true);
    expect(permissionSatisfies('push', 'admin')).toBe(false);
    expect(permissionSatisfies('admin', 'admin')).toBe(true);
    expect(permissionSatisfies('write', 'push')).toBe(false); // "write" is not on the ladder
  });
});
