# governance-audit

The custom compliance audit for HSL InfoDevOps GitHub governance. Covers the ~20% the
marketplace action does not: **GitHub Actions policies, team/collaborator permissions,
shared-workflows migration, and Docker base-image compliance.**

**Audit-only (iteration 1).** It reads `config/governance-policy.yml` and
`config/compliance-exceptions.yml`, inspects every in-scope repo via the GitHub API, and
writes a drift report to the job summary. It makes **no write calls**.

## Run locally

```bash
cd scripts/governance-audit
npm ci

# A token with read access to the org (PAT locally; App installation token in CI).
export GITHUB_TOKEN=ghp_xxx

npm run audit                      # all checks, audit-only
npm run audit -- --checks=docker-base-image,shared-workflows
npm run audit -- --fail-on-drift   # exit 1 if any drift/error (used once trusted)
npm run audit -- --help
```

The report is printed to stdout and, when `GITHUB_STEP_SUMMARY` is set (in CI), appended to
the job summary.

## Checks

| id | What it verifies | Exceptions key |
|---|---|---|
| `actions-policy` | Allowed-actions mode, selected-actions flags, default workflow permissions, PR-approval-by-Actions (org + repo) | `actions-policy` |
| `team-permissions` | Required teams have the right role; no stray direct collaborators | `team-permissions` |
| `shared-workflows` | `ci-cd.yml` exists and references `transitdata-shared-workflows`; no legacy `test-and-build.yml` | `shared-workflows-migration` |
| `docker-base-image` | `Dockerfile` uses `infodevops-docker-base-images`, not `eclipse-temurin:11-alpine` | `docker-base-image` |

## Adding an exception

Edit `config/compliance-exceptions.yml` and add the `owner/repo` under the relevant key,
with a comment explaining why and a tracking ticket. Exempted repos are reported as
`🟦 exception`, not drift.

## Developing

```bash
npm test          # vitest (pure-logic + content-check tests; GitHub API is mocked)
npm run build     # tsc -> dist/
npm run lint
npm run format
```

Layout: `src/index.ts` (CLI) · `src/config.ts` (zod-validated config) · `src/github.ts`
(Octokit + content helper) · `src/repos.ts` (scoped repo enumeration) ·
`src/checks/*` (one module per check) · `src/report.ts` (markdown). Each check is a pure
`(ctx) => Finding[]` so it can be unit-tested against fixtures.

## Future iterations (not implemented)

- `--apply` mode for `actions-policy` and `team-permissions` (writes via API, behind explicit
  confirmation).
- Flip the workflow to `--fail-on-drift` once the audit output is trusted.
