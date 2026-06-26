import type { Octokit } from '@octokit/rest';
import { describe, expect, it } from 'vitest';
import type { PolicyConfig } from '../src/config.js';
import { listRepos } from '../src/repos.js';
import { defaultPolicy } from './helpers.js';

interface RawRepo {
  name: string;
  full_name: string;
  archived?: boolean;
  fork?: boolean;
  default_branch?: string;
}

function raw(name: string, extra: Partial<RawRepo> = {}): RawRepo {
  return {
    name,
    full_name: `HSLdevcom/${name}`,
    archived: false,
    fork: false,
    default_branch: 'main',
    ...extra,
  };
}

/** Octokit whose paginate returns the given org repos for repos.listForOrg. */
function octokitWith(repos: RawRepo[]): Octokit {
  return {
    repos: { listForOrg: {} },
    async paginate(route: unknown) {
      // Only the listForOrg call is exercised here (no customProperty in these tests).
      if (route === (this as { repos: { listForOrg: unknown } }).repos.listForOrg) {
        return repos;
      }
      return [];
    },
  } as unknown as Octokit;
}

function policyWithScope(scope: Partial<PolicyConfig['scope']>): PolicyConfig {
  return { ...defaultPolicy, scope: { excludeArchived: true, excludeForks: true, ...scope } };
}

describe('listRepos — explicit scope.repos allowlist', () => {
  const all = [raw('alpha'), raw('beta'), raw('gamma')];

  it('returns all repos when no allowlist is set', async () => {
    const result = await listRepos(octokitWith(all), policyWithScope({}), () => {});
    expect(result.map((r) => r.name)).toEqual(['alpha', 'beta', 'gamma']);
  });

  it('narrows to the listed repos by short name', async () => {
    const result = await listRepos(octokitWith(all), policyWithScope({ repos: ['alpha', 'gamma'] }), () => {});
    expect(result.map((r) => r.name)).toEqual(['alpha', 'gamma']);
  });

  it('matches full names (owner/repo) too', async () => {
    const result = await listRepos(
      octokitWith(all),
      policyWithScope({ repos: ['HSLdevcom/beta'] }),
      () => {},
    );
    expect(result.map((r) => r.name)).toEqual(['beta']);
  });

  it('ignores names not present in the org', async () => {
    const result = await listRepos(
      octokitWith(all),
      policyWithScope({ repos: ['alpha', 'does-not-exist'] }),
      () => {},
    );
    expect(result.map((r) => r.name)).toEqual(['alpha']);
  });

  it('still applies excludeArchived/excludeForks on top of the allowlist', async () => {
    const repos = [raw('alpha'), raw('beta', { archived: true }), raw('gamma', { fork: true })];
    const result = await listRepos(
      octokitWith(repos),
      policyWithScope({ repos: ['alpha', 'beta', 'gamma'] }),
      () => {},
    );
    expect(result.map((r) => r.name)).toEqual(['alpha']);
  });

  it('treats an empty allowlist as "no filter"', async () => {
    const result = await listRepos(octokitWith(all), policyWithScope({ repos: [] }), () => {});
    expect(result.map((r) => r.name)).toEqual(['alpha', 'beta', 'gamma']);
  });
});
