import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { loadExceptions, loadPolicy } from './config.js';
import { createOctokit } from './github.js';
import { listRepos } from './repos.js';
import { emitReport, renderMarkdown, summarize } from './report.js';
import { actionsPolicyCheck } from './checks/actionsPolicy.js';
import { teamPermissionsCheck } from './checks/teamPermissions.js';
import { sharedWorkflowsCheck } from './checks/sharedWorkflows.js';
import { dockerBaseImageCheck } from './checks/dockerBaseImage.js';
import { ALL_CHECK_IDS, type Check, type CheckId, type Finding } from './types.js';

const REGISTRY: Check[] = [
  actionsPolicyCheck,
  teamPermissionsCheck,
  sharedWorkflowsCheck,
  dockerBaseImageCheck,
];

interface CliArgs {
  checks: CheckId[];
  failOnDrift: boolean;
  policyPath: string;
  exceptionsPath: string;
}

function repoRoot(): string {
  // src/index.ts -> scripts/governance-audit -> ../../ is the repo root.
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, '..', '..', '..');
}

function parseArgs(argv: string[]): CliArgs {
  const root = repoRoot();
  const args: CliArgs = {
    checks: ALL_CHECK_IDS,
    failOnDrift: false, // iteration 1: audit-only, do not fail by default
    policyPath: resolve(root, 'config', 'governance-policy.yml'),
    exceptionsPath: resolve(root, 'config', 'compliance-exceptions.yml'),
  };

  for (const arg of argv) {
    if (arg === '--fail-on-drift') {
      args.failOnDrift = true;
    } else if (arg.startsWith('--checks=')) {
      const value = arg.slice('--checks='.length);
      args.checks = value === 'all' ? ALL_CHECK_IDS : parseCheckList(value);
    } else if (arg.startsWith('--policy=')) {
      args.policyPath = resolve(arg.slice('--policy='.length));
    } else if (arg.startsWith('--exceptions=')) {
      args.exceptionsPath = resolve(arg.slice('--exceptions='.length));
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function parseCheckList(value: string): CheckId[] {
  const ids = value.split(',').map((s) => s.trim());
  for (const id of ids) {
    if (!ALL_CHECK_IDS.includes(id as CheckId)) {
      throw new Error(`Unknown check "${id}". Valid: ${ALL_CHECK_IDS.join(', ')}, all`);
    }
  }
  return ids as CheckId[];
}

function printHelp(): void {
  process.stdout.write(
    [
      'HSL repository governance compliance audit (audit-only).',
      '',
      'Usage: npm run audit -- [options]',
      '',
      'Options:',
      '  --checks=all|<id,...>   Checks to run (default: all)',
      `                          ids: ${ALL_CHECK_IDS.join(', ')}`,
      '  --fail-on-drift         Exit non-zero if any drift is found (default: off)',
      '  --policy=<path>         Path to governance-policy.yml',
      '  --exceptions=<path>     Path to compliance-exceptions.yml',
      '  -h, --help              Show this help',
      '',
      'Requires GITHUB_TOKEN in the environment.',
      '',
    ].join('\n'),
  );
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const log = (msg: string): void => console.error(`[audit] ${msg}`);

  const policy = loadPolicy(args.policyPath);
  const exceptions = loadExceptions(args.exceptionsPath);
  const octokit = createOctokit();

  log(`Listing repositories for ${policy.org} ...`);
  const repos = await listRepos(octokit, policy, log);

  const checks = REGISTRY.filter((c) => args.checks.includes(c.id));
  const findings: Finding[] = [];

  for (const check of checks) {
    log(`Running check: ${check.title}`);
    try {
      findings.push(...(await check.run({ octokit, org: policy.org, policy, exceptions, repos, log })));
    } catch (err) {
      findings.push({
        scope: policy.org,
        check: check.id,
        severity: 'error',
        message: `Check failed to run: ${(err as Error).message}`,
      });
    }
  }

  emitReport(renderMarkdown(checks, findings));

  const summary = summarize(findings);
  log(`Done. drift=${summary.drift} errors=${summary.errors} total=${summary.total}`);

  if (args.failOnDrift && (summary.drift > 0 || summary.errors > 0)) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(`[audit] fatal: ${(err as Error).message}`);
  process.exitCode = 2;
});
