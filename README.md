# infodevops-repo-governance

Centralized GitHub repository governance for HSL InfoDevOps (`HSLdevcom`).

This repository defines the **desired configuration** for all HSL InfoDevOps repositories
and enforces / audits it from one place. It implements the
[GitHub settings centralization proposal](https://github.com/HSLdevcom/team-infodevops/blob/main/docs/one-pagers/Github-settings-centralization-Proposal.md).

> ⚠️ **High-value supply-chain target.** This repo has org-wide write access to branch
> protection, security settings and CI/CD configuration. It is held to a higher security
> standard than the services it governs (private, 2 CODEOWNER reviews, no bypass actors,
> all third-party actions SHA-pinned). See the proposal, section *Security of the Central
> Management Repository*.

## Two enforcement engines

| Concern | Engine |
|---|---|
| Repo settings (merge strategy, auto-merge, delete branch) | Marketplace action (forked + SHA-pinned) |
| Branch protection (reviews, linear history, force-push, merge queue, status checks) | Marketplace action (rulesets API) |
| Security settings (secret scanning, Dependabot, push protection) | Marketplace action |
| GitHub Actions policies (allowed actions, default workflow permissions) | Custom script (`scripts/governance-audit`) |
| Team & collaborator permissions | Custom script |
| Shared-workflows migration compliance | Custom script |
| Docker base-image compliance | Custom script |
| **File sync** (workflow files, `dependabot.yml`, CODEOWNERS, …) | **Out of scope — never delegated to third-party tooling** |

The marketplace action is the forked, SHA-pinned `HSLdevcom/github-settings-sync`
(fork of `joshjohanning/bulk-github-repository-settings-sync`). The custom script covers
the ~20% the action does not.

## Layout

```
config/
  settings-config.yml                  # marketplace-action input (rules-based)
  rulesets/                            # version-controlled branch-protection rulesets (JSON)
    default-branch-protection.json
    robot-tests-branch-protection.json
    no-merge-queue-branch-protection.json
  governance-policy.yml                # desired Actions policy + team roles (custom script)
  compliance-exceptions.yml            # documented, intentional deviations (custom script)
.github/
  workflows/github-settings-sync.yml   # job 1: marketplace action · job 2: compliance audit
scripts/
  governance-audit/                    # the custom TypeScript audit tool
```

## Current status — iteration 1 (audit-only)

The custom script makes **zero write calls**. It detects and reports drift; remediation is
manual (guided by the
[Microservice Modernization Checklist](https://github.com/HSLdevcom/team-infodevops/blob/main/docs/one-pagers/Microservice-Modernization-Checklist.md)).
`--fail-on-drift` defaults to **off** during stabilization. Apply mode for Actions policies
and team permissions is a deliberate later iteration.

## Prerequisites (org-admin, not handled by this code)

These are flagged with `TODO` placeholders in the workflow until completed:

1. **Fork** `joshjohanning/bulk-github-repository-settings-sync` into
   `HSLdevcom/github-settings-sync` and pin a commit SHA in the workflow.
2. **Create a GitHub App** with least-privilege scopes (Administration RW, Contents RW,
   Pull Requests RW, Organization Custom Properties: Read), install it on the org, and store
   its credentials as the org secret(s) used by `actions/create-github-app-token`.
3. Make this repository **private** and apply the hardened branch protection described in the
   proposal.

## Running the audit locally

See [`scripts/governance-audit/README.md`](scripts/governance-audit/README.md).
