import { describe, expect, it } from 'vitest';
import {
  dockerBaseImageCheck,
  imageMatches,
  parseFromImages,
} from '../src/checks/dockerBaseImage.js';
import type { CheckContext, RepoInfo } from '../src/types.js';
import { makeContext, repo } from './helpers.js';

describe('parseFromImages', () => {
  it('extracts image refs from FROM lines, ignoring stage aliases and build args', () => {
    const dockerfile = [
      '# syntax=docker/dockerfile:1',
      'FROM hsldevcom/infodevops-docker-base-images:1.0.2-25-java-jdk AS build',
      'RUN ./mvnw package',
      'FROM --platform=linux/amd64 hsldevcom/infodevops-docker-base-images:1.0.2-25-java-jre',
      'FROM $BUILDER AS final',
    ].join('\n');
    expect(parseFromImages(dockerfile)).toEqual([
      'hsldevcom/infodevops-docker-base-images:1.0.2-25-java-jdk',
      'hsldevcom/infodevops-docker-base-images:1.0.2-25-java-jre',
    ]);
  });
});

describe('imageMatches', () => {
  it('matches exactly when the forbidden entry has a tag', () => {
    expect(imageMatches('eclipse-temurin:11-alpine', 'eclipse-temurin:11-alpine')).toBe(true);
    expect(imageMatches('eclipse-temurin:17-alpine', 'eclipse-temurin:11-alpine')).toBe(false);
  });

  it('matches any tag when the forbidden entry has no tag', () => {
    expect(imageMatches('eclipse-temurin:11-alpine', 'eclipse-temurin')).toBe(true);
    expect(imageMatches('eclipse-temurin', 'eclipse-temurin')).toBe(true);
  });
});

describe('dockerBaseImageCheck', () => {
  const repos: RepoInfo[] = [
    repo('good'),
    repo('legacy'),
    repo('no-docker'),
    repo('exempt'),
  ];

  function ctxFor(files: Record<string, Record<string, string | null>>): CheckContext {
    return makeContext({
      repos,
      exceptions: {
        'shared-workflows-migration': [],
        'docker-base-image': ['HSLdevcom/exempt'],
        'team-permissions': [],
        'actions-policy': [],
      },
      getContent: async (_owner, name, path) => files[name]?.[path] ?? null,
    });
  }

  it('passes a repo on the standard base image, flags a legacy one, skips exceptions', async () => {
    const ctx = ctxFor({
      good: {
        Dockerfile: 'FROM hsldevcom/infodevops-docker-base-images:1.0.2-25-java-jre',
      },
      legacy: { Dockerfile: 'FROM eclipse-temurin:11-alpine' },
      'no-docker': {},
      exempt: { Dockerfile: 'FROM eclipse-temurin:11-alpine' },
    });

    const findings = await dockerBaseImageCheck.run(ctx);
    const byScope = Object.fromEntries(findings.map((f) => [f.scope, f]));

    expect(byScope['HSLdevcom/good'].severity).toBe('ok');
    expect(byScope['HSLdevcom/legacy'].severity).toBe('drift');
    expect(byScope['HSLdevcom/no-docker'].severity).toBe('info');
    expect(byScope['HSLdevcom/exempt'].severity).toBe('exception');
  });
});
