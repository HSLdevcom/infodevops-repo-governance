import { describe, expect, it } from 'vitest';
import { sharedWorkflowsCheck } from '../src/checks/sharedWorkflows.js';
import { makeContext, repo } from './helpers.js';

const CI_CD = `jobs:
  ci-cd:
    uses: HSLdevcom/transitdata-shared-workflows/.github/workflows/ci-cd-java.yml@1.0.5
    secrets: inherit
`;

describe('sharedWorkflowsCheck', () => {
  it('classifies migrated, legacy, missing-ref and exception repos', async () => {
    const files: Record<string, Record<string, string | null>> = {
      migrated: { '.github/workflows/ci-cd.yml': CI_CD },
      'has-legacy': {
        '.github/workflows/ci-cd.yml': CI_CD,
        '.github/workflows/test-and-build.yml': 'name: old',
      },
      'wrong-ref': { '.github/workflows/ci-cd.yml': 'jobs:\n  build:\n    runs-on: ubuntu' },
      'no-workflow': {},
      exempt: {},
    };

    const ctx = makeContext({
      repos: [repo('migrated'), repo('has-legacy'), repo('wrong-ref'), repo('no-workflow'), repo('exempt')],
      exceptions: {
        'shared-workflows-migration': ['HSLdevcom/exempt'],
        'docker-base-image': [],
        'team-permissions': [],
        'actions-policy': [],
      },
      getContent: async (_owner, name, path) => files[name]?.[path] ?? null,
    });

    const findings = await sharedWorkflowsCheck.run(ctx);
    const byScope = Object.fromEntries(findings.map((f) => [f.scope, f]));

    expect(byScope['HSLdevcom/migrated'].severity).toBe('ok');
    expect(byScope['HSLdevcom/has-legacy'].severity).toBe('drift');
    expect(byScope['HSLdevcom/has-legacy'].message).toContain('legacy');
    expect(byScope['HSLdevcom/wrong-ref'].severity).toBe('drift');
    expect(byScope['HSLdevcom/no-workflow'].severity).toBe('drift');
    expect(byScope['HSLdevcom/exempt'].severity).toBe('exception');
  });
});
