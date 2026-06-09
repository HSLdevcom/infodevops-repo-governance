import { isException } from '../config.js';
import { getFileContent } from '../github.js';
import type { Check, CheckContext, Finding } from '../types.js';

/**
 * Flags repos that have not migrated to the shared CI/CD workflows.
 *
 * Drift if:
 *  - the standard ci-cd.yml is missing, OR
 *  - ci-cd.yml does not reference transitdata-shared-workflows, OR
 *  - the legacy test-and-build.yml still exists.
 *
 * Honors the "shared-workflows-migration" exceptions key. AUDIT-ONLY.
 */
export const sharedWorkflowsCheck: Check = {
  id: 'shared-workflows',
  title: 'Shared-workflows migration compliance',
  exceptionKey: 'shared-workflows-migration',

  async run(ctx: CheckContext): Promise<Finding[]> {
    const findings: Finding[] = [];
    const cfg = ctx.policy.compliance.sharedWorkflows;

    for (const repo of ctx.repos) {
      if (isException(ctx.exceptions, 'shared-workflows-migration', repo.fullName)) {
        findings.push({
          scope: repo.fullName,
          check: 'shared-workflows',
          severity: 'exception',
          message: 'Documented migration exception; skipped.',
        });
        continue;
      }

      try {
        const [ciCd, legacy] = await Promise.all([
          getFileContent(ctx.octokit, ctx.org, repo.name, cfg.workflowFile),
          getFileContent(ctx.octokit, ctx.org, repo.name, cfg.legacyFile),
        ]);

        const problems: string[] = [];
        if (legacy !== null) {
          problems.push(`legacy ${cfg.legacyFile} still present`);
        }
        if (ciCd === null) {
          problems.push(`${cfg.workflowFile} missing`);
        } else if (!ciCd.includes(cfg.requiredRef)) {
          problems.push(`${cfg.workflowFile} does not reference ${cfg.requiredRef}`);
        }

        if (problems.length === 0) {
          findings.push({
            scope: repo.fullName,
            check: 'shared-workflows',
            severity: 'ok',
            message: `Uses ${cfg.requiredRef}.`,
          });
        } else {
          findings.push({
            scope: repo.fullName,
            check: 'shared-workflows',
            severity: 'drift',
            message: problems.join('; '),
            expected: `ci-cd.yml referencing ${cfg.requiredRef}, no legacy workflow`,
          });
        }
      } catch (err) {
        findings.push({
          scope: repo.fullName,
          check: 'shared-workflows',
          severity: 'error',
          message: `Could not inspect workflows: ${(err as Error).message}`,
        });
      }
    }

    return findings;
  },
};
