import type { Octokit } from '@octokit/rest';
import type { PolicyConfig } from './config.js';
import type { RepoInfo } from './types.js';

/**
 * Enumerate the in-scope repositories for the org.
 *
 * Applies the policy's scope filters in order: an optional explicit `repos` allowlist,
 * then an optional custom-property narrowing, then the archived/forks exclusions. Falls
 * back to "all repos" (with a warning) if the custom-property lookup is unavailable.
 */
export async function listRepos(
  octokit: Octokit,
  policy: PolicyConfig,
  log: (msg: string) => void,
): Promise<RepoInfo[]> {
  const { org, scope } = policy;

  const all: RepoInfo[] = (
    await octokit.paginate(octokit.repos.listForOrg, {
      org,
      type: 'all',
      per_page: 100,
    })
  ).map((repo) => ({
    name: repo.name,
    fullName: repo.full_name,
    archived: repo.archived ?? false,
    fork: repo.fork ?? false,
    defaultBranch: repo.default_branch ?? 'main',
  }));

  let repos = all;

  if (scope.repos && scope.repos.length > 0) {
    const allow = new Set(scope.repos);
    repos = repos.filter((r) => allow.has(r.name) || allow.has(r.fullName));
    log(`Explicit scope.repos list matched ${repos.length} of ${all.length} repositories.`);
  }

  if (scope.customProperty) {
    const matching = await reposMatchingProperty(
      octokit,
      org,
      scope.customProperty.name,
      scope.customProperty.value,
      log,
    );
    if (matching) {
      repos = repos.filter((r) => matching.has(r.name));
    }
  }

  if (scope.excludeArchived) repos = repos.filter((r) => !r.archived);
  if (scope.excludeForks) repos = repos.filter((r) => !r.fork);

  log(`Scoped to ${repos.length} of ${all.length} org repositories.`);
  return repos.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Returns the set of repo names whose custom property `name` equals `value`,
 * or null if the property API could not be read (so the caller skips narrowing).
 */
async function reposMatchingProperty(
  octokit: Octokit,
  org: string,
  name: string,
  value: string,
  log: (msg: string) => void,
): Promise<Set<string> | null> {
  try {
    const rows = await octokit.paginate('GET /orgs/{org}/properties/values', {
      org,
      per_page: 100,
    });
    const matches = new Set<string>();
    for (const row of rows as Array<{
      repository_name: string;
      properties: Array<{ property_name: string; value: string | null }>;
    }>) {
      const prop = row.properties.find((p) => p.property_name === name);
      if (prop?.value === value) matches.add(row.repository_name);
    }
    log(`Custom property ${name}=${value} matched ${matches.size} repositories.`);
    return matches;
  } catch (err) {
    log(
      `WARNING: could not read org custom properties (${(err as Error).message}). ` +
        'Auditing all repos instead of narrowing by property.',
    );
    return null;
  }
}
