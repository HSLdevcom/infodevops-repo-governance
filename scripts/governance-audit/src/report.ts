import { appendFileSync } from 'node:fs';
import type { Check, Finding, Severity } from './types.js';

const SEVERITY_LABEL: Record<Severity, string> = {
  ok: '✅ ok',
  drift: '⚠️ drift',
  exception: '🟦 exception',
  error: '❌ error',
  info: 'ℹ️ info',
};

export interface ReportSummary {
  total: number;
  drift: number;
  errors: number;
  bySeverity: Record<Severity, number>;
}

export function summarize(findings: Finding[]): ReportSummary {
  const bySeverity: Record<Severity, number> = {
    ok: 0,
    drift: 0,
    exception: 0,
    error: 0,
    info: 0,
  };
  for (const f of findings) bySeverity[f.severity] += 1;
  return {
    total: findings.length,
    drift: bySeverity.drift,
    errors: bySeverity.error,
    bySeverity,
  };
}

/** Render the full audit as GitHub-flavoured markdown. */
export function renderMarkdown(checks: Check[], findings: Finding[]): string {
  const summary = summarize(findings);
  const lines: string[] = [];

  lines.push('# HSL Repository Governance — Compliance Audit');
  lines.push('');
  lines.push('_Audit-only run (no changes were applied)._');
  lines.push('');
  lines.push('| Severity | Count |');
  lines.push('| --- | ---: |');
  for (const sev of ['drift', 'error', 'exception', 'ok', 'info'] as Severity[]) {
    lines.push(`| ${SEVERITY_LABEL[sev]} | ${summary.bySeverity[sev]} |`);
  }
  lines.push('');

  for (const check of checks) {
    const own = findings.filter((f) => f.check === check.id);
    if (own.length === 0) continue;
    lines.push(`## ${check.title}`);
    lines.push('');
    // Surface drift and errors first, then exceptions; collapse the noisy "ok"/"info" rows.
    const notable = own.filter((f) => f.severity === 'drift' || f.severity === 'error');
    const exceptions = own.filter((f) => f.severity === 'exception');
    const quiet = own.filter((f) => f.severity === 'ok' || f.severity === 'info');

    lines.push(...renderTable([...notable, ...exceptions]));
    lines.push('');
    if (quiet.length > 0) {
      lines.push('<details><summary>Compliant repositories</summary>');
      lines.push('');
      lines.push(...renderTable(quiet));
      lines.push('');
      lines.push('</details>');
      lines.push('');
    }
  }

  return lines.join('\n');
}

function renderTable(findings: Finding[]): string[] {
  if (findings.length === 0) {
    return ['_No findings._'];
  }
  const rows: string[] = [];
  rows.push('| Scope | Status | Detail | Current | Expected |');
  rows.push('| --- | --- | --- | --- | --- |');
  for (const f of findings) {
    rows.push(
      `| ${f.scope} | ${SEVERITY_LABEL[f.severity]} | ${escape(f.message)} | ${escape(
        f.current,
      )} | ${escape(f.expected)} |`,
    );
  }
  return rows;
}

function escape(value: string | undefined): string {
  if (!value) return '';
  return value.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

/** Write the report to the GitHub job summary if available, else to stdout. */
export function emitReport(markdown: string): void {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath) {
    appendFileSync(summaryPath, markdown + '\n');
  }
  // Always echo to stdout so local runs and CI logs both show the report.
  process.stdout.write(markdown + '\n');
}
