import type { Report } from "@contribready/core";
import type { CliError } from "./errors.js";

const MAX_TERMINAL_TEXT = 4096;

function terminalText(value: unknown): string {
  return String(value)
    .replace(/[\u001b\u009b][[\]()#;?]*(?:(?:[a-zA-Z\d]*(?:;[-a-zA-Z\d/#&.:=?%@~_]+)*)?\u0007|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g, "")
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
    .slice(0, MAX_TERMINAL_TEXT);
}

function sarifLevel(outcome: string): "error" | "warning" | "note" { return outcome === "fail" ? "error" : outcome === "unknown" ? "warning" : "note"; }
function sarifUri(path: string): string {
  const normalized = path.replaceAll("\\", "/");
  const windows = normalized.match(/^([A-Za-z]):\/(.*)$/);
  if (windows) return `file:///${windows[1]}:/${windows[2].split("/").map(encodeURIComponent).join("/")}`;
  const encoded = normalized.split("/").map(encodeURIComponent).join("/");
  return normalized.startsWith("/") ? `file://${encoded}` : encoded;
}

export function renderSarif(report: Report, input: string, extra: Record<string, unknown> = {}): string {
  const rules = report.findings.map((finding) => ({
    id: finding.rule.id,
    name: finding.rule.name,
    shortDescription: { text: finding.rule.name },
    fullDescription: { text: finding.rule.purpose },
    help: { text: finding.recommendation },
    properties: { area: finding.rule.area, severity: finding.rule.severity, version: finding.rule.version, falsePositiveConsiderations: finding.rule.falsePositiveConsiderations, falseNegativeLimitations: finding.rule.falseNegativeLimitations },
  }));
  const uniqueRules = [...new Map(rules.map((rule) => [rule.id, rule])).values()];
  const results = report.findings.filter((finding) => finding.outcome !== "not-applicable").map((finding) => {
    const path = finding.evidence.find((item) => !/^https?:\/\//i.test(item.source))?.source;
    return {
      ruleId: finding.rule.id,
      level: sarifLevel(finding.outcome),
      message: { text: finding.message },
      ...(path ? { locations: [{ physicalLocation: { artifactLocation: { uri: sarifUri(path) } } }] } : {}),
      properties: { outcome: finding.outcome, area: finding.rule.area, recommendation: finding.recommendation, evidenceMissing: finding.evidenceMissing, conflictingEvidence: finding.conflictingEvidence, conflictsAssessed: finding.conflictsAssessed },
    };
  });
  return JSON.stringify({
    version: "2.1.0",
    $schema: "https://docs.oasis-open.org/sarif/sarif/v2.1.0/errata01/os/schemas/sarif-schema-2.1.0.json",
    runs: [{
      tool: { driver: { name: "ContribReady", semanticVersion: "0.1.0", rules: uniqueRules } },
      results,
      properties: { subject: report.subject, input, score: report.score, recommendations: report.recommendations, ...extra },
    }],
  }, null, 2);
}

export function renderReport(report: Report, format: "text" | "json" | "sarif", input: string, extra: Record<string, unknown> = {}): string {
  const payload = { ...report, input, ...extra };
  if (format === "json") return JSON.stringify(payload, null, 2);
  if (format === "sarif") return renderSarif(report, input, extra);
  const percentage = report.score.percentage === null ? "n/a" : `${report.score.percentage}%`;
  const coverage = report.score.coveragePercentage === null ? "n/a" : `${report.score.coveragePercentage}%`;
  const evidenceFiles = Array.isArray(extra.evidence) ? extra.evidence.length : 0;
  const lines = [`ContribReady ${terminalText(report.subject)} audit`, `Input: ${terminalText(input)}`, `Score: ${terminalText(percentage)} according to ContribReady's documented rules`, `Determinate coverage: ${terminalText(coverage)} (${report.score.unknownRules} unknown, ${report.score.notApplicableRules} not applicable)`, `Rules: ${report.findings.length}`, `Evidence files: ${evidenceFiles}`, ""];
  if (report.findings.length === 0) lines.push("No rules were evaluated for this input yet.");
  for (const finding of report.findings) {
    lines.push(`${terminalText(finding.outcome.toUpperCase())} ${terminalText(finding.rule.id)}: ${terminalText(finding.message)}`);
    if (finding.evidence.length) lines.push(`  Evidence: ${finding.evidence.map((item) => terminalText(item.source)).join(", ")}`);
    if (finding.evidenceMissing.length) lines.push(`  Missing evidence: ${finding.evidenceMissing.map(terminalText).join("; ")}`);
    if (finding.conflictingEvidence.length) lines.push(`  Conflicting evidence: ${finding.conflictingEvidence.map((item) => terminalText(item.source)).join(", ")}`);
    else if (finding.conflictsAssessed) lines.push("  Conflicts: assessed; no incompatible claims detected by this rule");
    else lines.push("  Conflicts: not assessed by this rule");
    if (finding.rule.falseNegativeLimitations.length) lines.push(`  Limitation: ${finding.rule.falseNegativeLimitations.map(terminalText).join("; ")}`);
    lines.push(`  Next: ${terminalText(finding.recommendation)}`);
  }
  if (report.recommendations.length) {
    lines.push("", "Prioritized recommendations:");
    for (const recommendation of report.recommendations) lines.push(`  [${terminalText(recommendation.priority)}] ${terminalText(recommendation.ruleId)}: ${terminalText(recommendation.text)}`);
  }
  return lines.join("\n");
}

export function renderError(error: CliError, format: "text" | "json" | "sarif"): string {
  if (format === "sarif") return JSON.stringify({
    version: "2.1.0",
    $schema: "https://docs.oasis-open.org/sarif/sarif/v2.1.0/errata01/os/schemas/sarif-schema-2.1.0.json",
    runs: [{
      tool: { driver: { name: "ContribReady", semanticVersion: "0.1.0" } },
      results: [],
      invocations: [{ executionSuccessful: false, toolExecutionNotifications: [{ level: "error", message: { text: `${terminalText(error.code)}: ${terminalText(error.message)}` } }] }],
    }],
  }, null, 2);
  return format === "json" ? JSON.stringify({ schemaVersion: 1, error: { code: error.code, message: error.message } }, null, 2) : `Error [${terminalText(error.code)}]: ${terminalText(error.message)}`;
}

export function renderUsage(): string { return "Use contribready --help for usage."; }
