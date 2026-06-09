import type { Octokit } from '@octokit/rest';
import type { ExceptionsConfig, PolicyConfig } from './config.js';

/** Identifiers for the four custom checks. Used in findings and on the CLI (--checks=). */
export type CheckId =
  | 'actions-policy'
  | 'team-permissions'
  | 'shared-workflows'
  | 'docker-base-image';

export const ALL_CHECK_IDS: CheckId[] = [
  'actions-policy',
  'team-permissions',
  'shared-workflows',
  'docker-base-image',
];

/**
 * Outcome of evaluating a single concern.
 * - ok        : matches policy
 * - drift     : differs from policy and is NOT an accepted exception
 * - exception : differs from policy but is listed in compliance-exceptions.yml
 * - error     : the check could not be evaluated (e.g. an unexpected API error)
 * - info      : neutral context (e.g. "no Dockerfile — not a containerized repo")
 */
export type Severity = 'ok' | 'drift' | 'exception' | 'error' | 'info';

export interface Finding {
  /** Full name "owner/repo", or the org name for org-level findings. */
  scope: string;
  check: CheckId;
  severity: Severity;
  message: string;
  current?: string;
  expected?: string;
}

export interface RepoInfo {
  name: string;
  fullName: string;
  archived: boolean;
  fork: boolean;
  defaultBranch: string;
}

export interface CheckContext {
  octokit: Octokit;
  org: string;
  policy: PolicyConfig;
  exceptions: ExceptionsConfig;
  repos: RepoInfo[];
  log: (msg: string) => void;
}

export interface Check {
  id: CheckId;
  title: string;
  /** Compliance-exceptions.yml key this check honours (if any). */
  exceptionKey?: keyof ExceptionsConfig;
  run(ctx: CheckContext): Promise<Finding[]>;
}
