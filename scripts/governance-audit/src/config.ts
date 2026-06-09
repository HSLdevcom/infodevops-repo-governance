import { readFileSync } from 'node:fs';
import { load } from 'js-yaml';
import { z } from 'zod';

/** Schema for config/governance-policy.yml — the desired state. */
const policySchema = z.object({
  org: z.string().min(1),
  scope: z
    .object({
      excludeArchived: z.boolean().default(true),
      excludeForks: z.boolean().default(true),
      customProperty: z
        .object({
          name: z.string().min(1),
          value: z.string().min(1),
        })
        .optional(),
    })
    .default({ excludeArchived: true, excludeForks: true }),
  actions: z.object({
    allowedActions: z.enum(['all', 'local_only', 'selected']),
    githubOwnedAllowed: z.boolean().default(true),
    verifiedAllowed: z.boolean().default(true),
    patternsAllowed: z.array(z.string()).default([]),
    defaultWorkflowPermissions: z.enum(['read', 'write']),
    canApprovePullRequestReviews: z.boolean().default(false),
  }),
  teams: z.object({
    required: z
      .array(
        z.object({
          slug: z.string().min(1),
          permission: z.enum(['pull', 'triage', 'push', 'maintain', 'admin']),
        }),
      )
      .default([]),
    allowDirectCollaborators: z.boolean().default(false),
  }),
  compliance: z.object({
    sharedWorkflows: z.object({
      workflowFile: z.string().min(1),
      legacyFile: z.string().min(1),
      requiredRef: z.string().min(1),
    }),
    dockerBaseImage: z.object({
      dockerfilePaths: z.array(z.string().min(1)).min(1),
      requiredBaseImageRepo: z.string().min(1),
      forbiddenBaseImages: z.array(z.string().min(1)).default([]),
    }),
  }),
});

/** Schema for config/compliance-exceptions.yml — accepted deviations per check. */
const exceptionsSchema = z
  .object({
    'shared-workflows-migration': z.array(z.string()).default([]),
    'docker-base-image': z.array(z.string()).default([]),
    'team-permissions': z.array(z.string()).default([]),
    'actions-policy': z.array(z.string()).default([]),
  })
  .partial()
  .transform((value) => ({
    'shared-workflows-migration': value['shared-workflows-migration'] ?? [],
    'docker-base-image': value['docker-base-image'] ?? [],
    'team-permissions': value['team-permissions'] ?? [],
    'actions-policy': value['actions-policy'] ?? [],
  }));

export type PolicyConfig = z.infer<typeof policySchema>;
export type ExceptionsConfig = z.infer<typeof exceptionsSchema>;

function loadYaml(path: string): unknown {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (err) {
    throw new Error(`Cannot read config file ${path}: ${(err as Error).message}`);
  }
  return load(raw) ?? {};
}

export function loadPolicy(path: string): PolicyConfig {
  const parsed = policySchema.safeParse(loadYaml(path));
  if (!parsed.success) {
    throw new Error(`Invalid policy config ${path}:\n${formatZodError(parsed.error)}`);
  }
  return parsed.data;
}

export function loadExceptions(path: string): ExceptionsConfig {
  const parsed = exceptionsSchema.safeParse(loadYaml(path));
  if (!parsed.success) {
    throw new Error(`Invalid exceptions config ${path}:\n${formatZodError(parsed.error)}`);
  }
  return parsed.data;
}

function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
}

/** True if `repoFullName` is listed under `key` in the exceptions file. */
export function isException(
  exceptions: ExceptionsConfig,
  key: keyof ExceptionsConfig,
  repoFullName: string,
): boolean {
  return exceptions[key].includes(repoFullName);
}
