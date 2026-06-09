import { isException } from '../config.js';
import type { Check, CheckContext, Finding } from '../types.js';

/**
 * Audits team roles and direct collaborators per repo.
 *
 * Reports drift on:
 *  - a required team being absent, or present with the wrong permission
 *  - direct (non-team) collaborators when policy disallows them
 *
 * AUDIT-ONLY: never writes.
 */
export const teamPermissionsCheck: Check = {
  id: 'team-permissions',
  title: 'Team & collaborator permissions',
  exceptionKey: 'team-permissions',

  async run(ctx: CheckContext): Promise<Finding[]> {
    const findings: Finding[] = [];
    for (const repo of ctx.repos) {
      if (isException(ctx.exceptions, 'team-permissions', repo.fullName)) {
        findings.push({
          scope: repo.fullName,
          check: 'team-permissions',
          severity: 'exception',
          message: 'Listed in team-permissions exceptions; skipped.',
        });
        continue;
      }
      findings.push(...(await auditRepo(ctx, repo.name, repo.fullName)));
    }
    return findings;
  },
};

async function auditRepo(
  ctx: CheckContext,
  repo: string,
  fullName: string,
): Promise<Finding[]> {
  const { octokit, org, policy } = ctx;
  const findings: Finding[] = [];

  try {
    const teams = await octokit.paginate(octokit.repos.listTeams, {
      owner: org,
      repo,
      per_page: 100,
    });
    const bySlug = new Map(teams.map((t) => [t.slug, t.permission]));

    for (const required of policy.teams.required) {
      const actual = bySlug.get(required.slug);
      if (actual === undefined) {
        findings.push({
          scope: fullName,
          check: 'team-permissions',
          severity: 'drift',
          message: `Required team @${org}/${required.slug} is not granted access.`,
          current: 'absent',
          expected: required.permission,
        });
      } else if (!permissionSatisfies(actual, required.permission)) {
        findings.push({
          scope: fullName,
          check: 'team-permissions',
          severity: 'drift',
          message: `Team @${org}/${required.slug} has the wrong permission.`,
          current: actual,
          expected: required.permission,
        });
      } else {
        findings.push({
          scope: fullName,
          check: 'team-permissions',
          severity: 'ok',
          message: `Team @${org}/${required.slug} permission matches policy.`,
          current: actual,
          expected: required.permission,
        });
      }
    }

    if (!policy.teams.allowDirectCollaborators) {
      const direct = await octokit.paginate(octokit.repos.listCollaborators, {
        owner: org,
        repo,
        affiliation: 'direct',
        per_page: 100,
      });
      if (direct.length > 0) {
        findings.push({
          scope: fullName,
          check: 'team-permissions',
          severity: 'drift',
          message: 'Direct (non-team) collaborators present; policy requires team-based access.',
          current: direct.map((c) => c.login).join(', '),
          expected: 'none',
        });
      }
    }
  } catch (err) {
    findings.push({
      scope: fullName,
      check: 'team-permissions',
      severity: 'error',
      message: `Could not read team/collaborator data: ${(err as Error).message}`,
    });
  }

  return findings;
}

/**
 * Ordered permission ladder. A repo satisfies the policy when its actual permission is
 * at least the required level (e.g. "admin" satisfies a "maintain" requirement).
 */
const LADDER = ['pull', 'triage', 'push', 'maintain', 'admin'];

export function permissionSatisfies(actual: string, required: string): boolean {
  return LADDER.indexOf(actual) >= LADDER.indexOf(required) && LADDER.includes(actual);
}
