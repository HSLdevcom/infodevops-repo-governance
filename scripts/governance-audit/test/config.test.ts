import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isException, loadExceptions, loadPolicy } from '../src/config.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'gov-cfg-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function write(name: string, content: string): string {
  const path = join(dir, name);
  writeFileSync(path, content, 'utf8');
  return path;
}

const VALID_POLICY = `
org: HSLdevcom
actions:
  allowedActions: selected
  patternsAllowed: [HSLdevcom/*]
  defaultWorkflowPermissions: read
teams:
  required:
    - slug: infodevops-team
      permission: admin
compliance:
  sharedWorkflows:
    workflowFile: .github/workflows/ci-cd.yml
    legacyFile: .github/workflows/test-and-build.yml
    requiredRef: HSLdevcom/transitdata-shared-workflows
  dockerBaseImage:
    dockerfilePaths: [Dockerfile]
    requiredBaseImageRepo: hsldevcom/infodevops-docker-base-images
    forbiddenBaseImages: [eclipse-temurin:11-alpine]
`;

describe('loadPolicy', () => {
  it('parses a valid policy and applies defaults', () => {
    const policy = loadPolicy(write('p.yml', VALID_POLICY));
    expect(policy.org).toBe('HSLdevcom');
    expect(policy.scope.excludeArchived).toBe(true);
    expect(policy.actions.githubOwnedAllowed).toBe(true);
    expect(policy.teams.allowDirectCollaborators).toBe(false);
  });

  it('throws a descriptive error on an invalid enum value', () => {
    const bad = VALID_POLICY.replace('defaultWorkflowPermissions: read', 'defaultWorkflowPermissions: maybe');
    expect(() => loadPolicy(write('bad.yml', bad))).toThrow(/defaultWorkflowPermissions/);
  });

  it('throws when a required section is missing', () => {
    expect(() => loadPolicy(write('empty.yml', 'org: HSLdevcom\n'))).toThrow(/actions/);
  });
});

describe('loadExceptions', () => {
  it('fills missing keys with empty arrays', () => {
    const ex = loadExceptions(write('e.yml', 'docker-base-image: [HSLdevcom/foo]\n'));
    expect(ex['docker-base-image']).toEqual(['HSLdevcom/foo']);
    expect(ex['team-permissions']).toEqual([]);
  });

  it('isException reflects membership', () => {
    const ex = loadExceptions(write('e2.yml', 'shared-workflows-migration: [HSLdevcom/jore-map-ui]\n'));
    expect(isException(ex, 'shared-workflows-migration', 'HSLdevcom/jore-map-ui')).toBe(true);
    expect(isException(ex, 'shared-workflows-migration', 'HSLdevcom/other')).toBe(false);
  });
});
