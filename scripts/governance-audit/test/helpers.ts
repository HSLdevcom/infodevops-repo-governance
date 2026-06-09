import type { Octokit } from '@octokit/rest';
import type { ExceptionsConfig, PolicyConfig } from '../src/config.js';
import type { CheckContext, RepoInfo } from '../src/types.js';

export function repo(name: string): RepoInfo {
  return {
    name,
    fullName: `HSLdevcom/${name}`,
    archived: false,
    fork: false,
    defaultBranch: 'main',
  };
}

export const defaultPolicy: PolicyConfig = {
  org: 'HSLdevcom',
  scope: { excludeArchived: true, excludeForks: true },
  actions: {
    allowedActions: 'selected',
    githubOwnedAllowed: true,
    verifiedAllowed: true,
    patternsAllowed: ['HSLdevcom/*'],
    defaultWorkflowPermissions: 'read',
    canApprovePullRequestReviews: false,
  },
  teams: {
    required: [{ slug: 'infodevops-team', permission: 'admin' }],
    allowDirectCollaborators: false,
  },
  compliance: {
    sharedWorkflows: {
      workflowFile: '.github/workflows/ci-cd.yml',
      legacyFile: '.github/workflows/test-and-build.yml',
      requiredRef: 'HSLdevcom/transitdata-shared-workflows',
    },
    dockerBaseImage: {
      dockerfilePaths: ['Dockerfile'],
      requiredBaseImageRepo: 'hsldevcom/infodevops-docker-base-images',
      forbiddenBaseImages: ['eclipse-temurin:11-alpine', 'eclipse-temurin:11'],
    },
  },
};

export const emptyExceptions: ExceptionsConfig = {
  'shared-workflows-migration': [],
  'docker-base-image': [],
  'team-permissions': [],
  'actions-policy': [],
};

interface ContextOptions {
  repos: RepoInfo[];
  policy?: PolicyConfig;
  exceptions?: ExceptionsConfig;
  /** Stub for github.getFileContent — keyed lookups returning file content or null. */
  getContent?: (owner: string, repo: string, path: string) => Promise<string | null>;
}

/**
 * Build a CheckContext with a minimal Octokit whose repos.getContent is backed by the
 * provided `getContent` stub. Only the surface used by content-based checks is wired here;
 * API-heavy checks (actions/teams) are exercised against their own mocked Octokit.
 */
export function makeContext(opts: ContextOptions): CheckContext {
  const getContent = opts.getContent ?? (async () => null);
  const octokit = {
    repos: {
      async getContent({
        owner,
        repo,
        path,
      }: {
        owner: string;
        repo: string;
        path: string;
      }) {
        const content = await getContent(owner, repo, path);
        if (content === null) {
          const err = new Error('Not Found') as Error & { status: number };
          err.status = 404;
          throw err;
        }
        return {
          data: {
            type: 'file',
            content: Buffer.from(content, 'utf8').toString('base64'),
          },
        };
      },
    },
  } as unknown as Octokit;

  return {
    octokit,
    org: 'HSLdevcom',
    policy: opts.policy ?? defaultPolicy,
    exceptions: opts.exceptions ?? emptyExceptions,
    repos: opts.repos,
    log: () => {},
  };
}
