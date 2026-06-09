import { isException } from '../config.js';
import { getFileContent } from '../github.js';
import type { Check, CheckContext, Finding } from '../types.js';

/**
 * Flags repos whose Dockerfile uses a non-standard / forbidden base image.
 *
 * Drift if a FROM line references a forbidden image (e.g. eclipse-temurin:11-alpine) or if
 * no FROM line uses the required base-image repo. Repos with no Dockerfile are reported as
 * "info" (not containerized) rather than drift.
 *
 * Honors the "docker-base-image" exceptions key. AUDIT-ONLY.
 */
export const dockerBaseImageCheck: Check = {
  id: 'docker-base-image',
  title: 'Docker base-image compliance',
  exceptionKey: 'docker-base-image',

  async run(ctx: CheckContext): Promise<Finding[]> {
    const findings: Finding[] = [];
    const cfg = ctx.policy.compliance.dockerBaseImage;

    for (const repo of ctx.repos) {
      if (isException(ctx.exceptions, 'docker-base-image', repo.fullName)) {
        findings.push({
          scope: repo.fullName,
          check: 'docker-base-image',
          severity: 'exception',
          message: 'Documented base-image exception; skipped.',
        });
        continue;
      }

      try {
        const froms: string[] = [];
        for (const path of cfg.dockerfilePaths) {
          const content = await getFileContent(ctx.octokit, ctx.org, repo.name, path);
          if (content !== null) froms.push(...parseFromImages(content));
        }

        if (froms.length === 0) {
          findings.push({
            scope: repo.fullName,
            check: 'docker-base-image',
            severity: 'info',
            message: 'No Dockerfile found; not a containerized service.',
          });
          continue;
        }

        const forbidden = froms.filter((image) =>
          cfg.forbiddenBaseImages.some((bad) => imageMatches(image, bad)),
        );
        const usesRequired = froms.some((image) => image.includes(cfg.requiredBaseImageRepo));

        if (forbidden.length > 0) {
          findings.push({
            scope: repo.fullName,
            check: 'docker-base-image',
            severity: 'drift',
            message: 'Uses a forbidden base image.',
            current: forbidden.join(', '),
            expected: cfg.requiredBaseImageRepo,
          });
        } else if (!usesRequired) {
          findings.push({
            scope: repo.fullName,
            check: 'docker-base-image',
            severity: 'drift',
            message: `No FROM uses ${cfg.requiredBaseImageRepo}.`,
            current: froms.join(', '),
            expected: cfg.requiredBaseImageRepo,
          });
        } else {
          findings.push({
            scope: repo.fullName,
            check: 'docker-base-image',
            severity: 'ok',
            message: `Uses ${cfg.requiredBaseImageRepo}.`,
            current: froms.join(', '),
          });
        }
      } catch (err) {
        findings.push({
          scope: repo.fullName,
          check: 'docker-base-image',
          severity: 'error',
          message: `Could not inspect Dockerfile: ${(err as Error).message}`,
        });
      }
    }

    return findings;
  },
};

/** Extract the image reference from each `FROM <image> [AS stage]` line. */
export function parseFromImages(dockerfile: string): string[] {
  const images: string[] = [];
  for (const line of dockerfile.split('\n')) {
    const match = /^\s*FROM\s+(?:--platform=\S+\s+)?(\S+)/i.exec(line);
    if (match && match[1] && !match[1].startsWith('$')) {
      images.push(match[1]);
    }
  }
  return images;
}

/**
 * Whether an image reference matches a forbidden entry. An entry without a tag (no ":")
 * matches any tag of that image; an entry with a tag matches exactly.
 */
export function imageMatches(image: string, forbidden: string): boolean {
  if (forbidden.includes(':')) return image === forbidden;
  const name = image.split(':')[0];
  return name === forbidden;
}
