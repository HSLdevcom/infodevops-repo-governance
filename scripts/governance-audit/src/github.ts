import { Octokit } from '@octokit/rest';

/**
 * Build an Octokit client from the GITHUB_TOKEN env var.
 *
 * The token is a short-lived GitHub App installation token minted by the workflow
 * (actions/create-github-app-token). The script itself never handles the App private key.
 */
export function createOctokit(): Octokit {
  const token = process.env.GITHUB_TOKEN?.trim();
  if (!token) {
    throw new Error(
      'GITHUB_TOKEN is not set. In CI this is the GitHub App installation token; ' +
        'locally, export a PAT with read access to the org.',
    );
  }
  return new Octokit({
    auth: token,
    userAgent: 'hsl-infodevops-repo-governance',
  });
}

/** True for a 404 (resource absent) so callers can treat "missing" as a normal signal. */
export function isNotFound(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { status?: number }).status === 404;
}

/**
 * Fetch and UTF-8 decode a file from a repo's default branch.
 * Returns null when the file does not exist (404).
 */
export async function getFileContent(
  octokit: Octokit,
  owner: string,
  repo: string,
  path: string,
): Promise<string | null> {
  try {
    const res = await octokit.repos.getContent({ owner, repo, path });
    const data = res.data;
    if (Array.isArray(data) || data.type !== 'file' || !('content' in data)) {
      return null;
    }
    return Buffer.from(data.content, 'base64').toString('utf8');
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}
