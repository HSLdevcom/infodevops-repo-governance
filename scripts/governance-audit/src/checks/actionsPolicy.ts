import { isException } from '../config.js';
import { isNotFound } from '../github.js';
import type { Check, CheckContext, Finding } from '../types.js';

/**
 * Audits GitHub Actions policy at the org level (once) and per repo.
 *
 * Reports drift on:
 *  - allowed-actions mode broader than policy
 *  - selected-actions flags (github-owned / verified / patterns) differing from policy
 *  - default workflow permissions != policy (should be "read")
 *  - "Actions can approve pull requests" enabled when policy forbids it
 *
 * AUDIT-ONLY: never writes.
 */
export const actionsPolicyCheck: Check = {
  id: 'actions-policy',
  title: 'GitHub Actions policy',
  exceptionKey: 'actions-policy',

  async run(ctx: CheckContext): Promise<Finding[]> {
    const findings: Finding[] = [];
    findings.push(...(await auditOrg(ctx)));
    for (const repo of ctx.repos) {
      if (isException(ctx.exceptions, 'actions-policy', repo.fullName)) {
        findings.push({
          scope: repo.fullName,
          check: 'actions-policy',
          severity: 'exception',
          message: 'Listed in actions-policy exceptions; skipped.',
        });
        continue;
      }
      findings.push(...(await auditRepo(ctx, repo.name, repo.fullName)));
    }
    return findings;
  },
};

async function auditOrg(ctx: CheckContext): Promise<Finding[]> {
  const { octokit, org, policy } = ctx;
  const findings: Finding[] = [];

  const perms = await octokit.actions.getGithubActionsPermissionsOrganization({ org });
  findings.push(
    ...compareAllowedActions(`${org} (org)`, perms.data.allowed_actions, policy),
  );
  if (perms.data.allowed_actions === 'selected') {
    const sel = await octokit.actions.getAllowedActionsOrganization({ org });
    findings.push(...compareSelectedActions(`${org} (org)`, sel.data, policy));
  }

  const wf = await octokit.actions.getGithubActionsDefaultWorkflowPermissionsOrganization({
    org,
  });
  findings.push(...compareWorkflowPermissions(`${org} (org)`, wf.data, policy));

  return findings;
}

async function auditRepo(
  ctx: CheckContext,
  repo: string,
  fullName: string,
): Promise<Finding[]> {
  const { octokit, org, policy } = ctx;
  const findings: Finding[] = [];

  try {
    const perms = await octokit.actions.getGithubActionsPermissionsRepository({
      owner: org,
      repo,
    });
    findings.push(...compareAllowedActions(fullName, perms.data.allowed_actions, policy));
    if (perms.data.allowed_actions === 'selected') {
      const sel = await octokit.actions.getAllowedActionsRepository({ owner: org, repo });
      findings.push(...compareSelectedActions(fullName, sel.data, policy));
    }

    const wf = await octokit.actions.getGithubActionsDefaultWorkflowPermissionsRepository({
      owner: org,
      repo,
    });
    findings.push(...compareWorkflowPermissions(fullName, wf.data, policy));
  } catch (err) {
    if (isNotFound(err)) {
      // Repo inherits org policy / Actions disabled — not drift on its own.
      findings.push({
        scope: fullName,
        check: 'actions-policy',
        severity: 'info',
        message: 'No repo-level Actions policy (inherits org settings).',
      });
    } else {
      findings.push({
        scope: fullName,
        check: 'actions-policy',
        severity: 'error',
        message: `Could not read Actions policy: ${(err as Error).message}`,
      });
    }
  }

  return findings;
}

function compareAllowedActions(
  scope: string,
  actual: string | undefined,
  policy: CheckContext['policy'],
): Finding[] {
  if (actual === undefined) return [];
  if (actual === policy.actions.allowedActions) {
    return [
      {
        scope,
        check: 'actions-policy',
        severity: 'ok',
        message: 'Allowed-actions mode matches policy.',
        current: actual,
        expected: policy.actions.allowedActions,
      },
    ];
  }
  return [
    {
      scope,
      check: 'actions-policy',
      severity: 'drift',
      message: 'Allowed-actions mode differs from policy.',
      current: actual,
      expected: policy.actions.allowedActions,
    },
  ];
}

function compareSelectedActions(
  scope: string,
  data: {
    github_owned_allowed?: boolean;
    verified_allowed?: boolean;
    patterns_allowed?: string[];
  },
  policy: CheckContext['policy'],
): Finding[] {
  const findings: Finding[] = [];
  const a = policy.actions;

  if ((data.github_owned_allowed ?? false) !== a.githubOwnedAllowed) {
    findings.push(drift(scope, 'github-owned actions allowed', data.github_owned_allowed, a.githubOwnedAllowed));
  }
  if ((data.verified_allowed ?? false) !== a.verifiedAllowed) {
    findings.push(drift(scope, 'verified-creator actions allowed', data.verified_allowed, a.verifiedAllowed));
  }
  const actualPatterns = (data.patterns_allowed ?? []).slice().sort();
  const expectedPatterns = a.patternsAllowed.slice().sort();
  if (JSON.stringify(actualPatterns) !== JSON.stringify(expectedPatterns)) {
    findings.push(
      drift(scope, 'allowed action patterns', actualPatterns.join(', '), expectedPatterns.join(', ')),
    );
  }
  if (findings.length === 0) {
    findings.push({
      scope,
      check: 'actions-policy',
      severity: 'ok',
      message: 'Selected-actions configuration matches policy.',
    });
  }
  return findings;
}

function compareWorkflowPermissions(
  scope: string,
  data: { default_workflow_permissions?: string; can_approve_pull_request_reviews?: boolean },
  policy: CheckContext['policy'],
): Finding[] {
  const findings: Finding[] = [];
  const a = policy.actions;

  if (data.default_workflow_permissions !== a.defaultWorkflowPermissions) {
    findings.push(
      drift(
        scope,
        'default workflow permissions',
        data.default_workflow_permissions,
        a.defaultWorkflowPermissions,
      ),
    );
  }
  if ((data.can_approve_pull_request_reviews ?? false) !== a.canApprovePullRequestReviews) {
    findings.push(
      drift(
        scope,
        'Actions can approve PRs',
        data.can_approve_pull_request_reviews,
        a.canApprovePullRequestReviews,
      ),
    );
  }
  if (findings.length === 0) {
    findings.push({
      scope,
      check: 'actions-policy',
      severity: 'ok',
      message: 'Workflow permissions match policy.',
    });
  }
  return findings;
}

function drift(
  scope: string,
  what: string,
  current: unknown,
  expected: unknown,
): Finding {
  return {
    scope,
    check: 'actions-policy',
    severity: 'drift',
    message: `${what} differs from policy.`,
    current: String(current),
    expected: String(expected),
  };
}
