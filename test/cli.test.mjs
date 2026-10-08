import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCli } from "../dist/index.js";
import { renderReport } from "../dist/output.js";

function invoke(args) {
  const out = [];
  const err = [];
  const code = runCli(args, { stdout: (value) => out.push(value), stderr: (value) => err.push(value) });
  return { code, stdout: out.join(""), stderr: err.join("") };
}

test("help and version are stable", () => {
  assert.equal(invoke(["--help"]).code, 0);
  assert.match(invoke(["--help"]).stdout, /Usage:/);
  assert.equal(invoke(["--version"]).stdout.trim(), "0.1.0");
});

test("audit emits deterministic JSON without executing repository code", () => {
  const root = mkdtempSync(join(tmpdir(), "contribready-audit-"));
  writeFileSync(join(root, "README.md"), "Getting started: Node.js 20. Run npm install. Run npm test.");
  writeFileSync(join(root, "CONTRIBUTING.md"), "Create a branch and open a pull request. Maintainer review and required checks are needed.");
  writeFileSync(join(root, "SECURITY.md"), "Report vulnerabilities privately.");
  writeFileSync(join(root, "SUPPORT.md"), "Ask questions in the community discussion forum.");
  writeFileSync(join(root, "package.json"), "{}\n");
  const result = invoke(["audit", root, "--format", "json"]);
  const repeated = invoke(["audit", root, "--format", "json"]);
  assert.equal(result.code, 0);
  assert.equal(result.stdout, repeated.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.subject, "repository");
  assert.equal(report.score.percentage, 81);
  assert.equal(report.findings.length, 14);
});

test("audit discovers evidence files and skips source/dependency/build directories", () => {
  const root = mkdtempSync(join(tmpdir(), "contribready-evidence-"));
  writeFileSync(join(root, "README.md"), "Read me");
  writeFileSync(join(root, "package-lock.json"), "{}");
  writeFileSync(join(root, "source.ts"), "must not be read");
  const workflowDir = join(root, ".github", "workflows");
  const issueDir = join(root, ".github", "ISSUE_TEMPLATE");
  const testsDir = join(root, "tests");
  const ignoredDir = join(root, "node_modules");
  const buildDir = join(root, "dist");
  for (const directory of [workflowDir, issueDir, testsDir, ignoredDir, buildDir]) {
    mkdirSync(directory, { recursive: true });
  }
  writeFileSync(join(workflowDir, "ci.yml"), "name: CI");
  writeFileSync(join(issueDir, "bug.md"), "# Bug");
  writeFileSync(join(testsDir, "example.test.ts"), "test");
  writeFileSync(join(ignoredDir, "package.json"), "must not be read");
  writeFileSync(join(buildDir, "README.md"), "must not be read");
  const result = invoke(["audit", root, "--format", "json"]);
  const report = JSON.parse(result.stdout);
  const paths = report.evidence.map((file) => file.path);
  assert.deepEqual(paths, [".github/ISSUE_TEMPLATE/bug.md", ".github/workflows/ci.yml", "package-lock.json", "README.md", "tests/example.test.ts"]);
  assert.equal(paths.includes("source.ts"), false);
  assert.equal(paths.includes("node_modules/package.json"), false);
  assert.equal(paths.includes("dist/README.md"), false);
});

test("audit skips oversized evidence files instead of reading them", () => {
  const root = mkdtempSync(join(tmpdir(), "contribready-large-"));
  writeFileSync(join(root, "README.md"), "x".repeat(256 * 1024 + 1));
  const result = invoke(["audit", root, "--format", "json"]);
  const report = JSON.parse(result.stdout);
  assert.equal(report.evidence.some((file) => file.path === "README.md"), false);
  assert.equal(report.metadata.skippedFiles, "1");
});

test("strict audit returns a finding exit code", () => {
  const root = mkdtempSync(join(tmpdir(), "contribready-empty-"));
  const result = invoke(["audit", root, "--strict"]);
  assert.equal(result.code, 1);
  assert.match(result.stdout, /FAIL CR-CONTRIB-001/);
});

test("issue command reads bounded Markdown and preserves the title", () => {
  const root = mkdtempSync(join(tmpdir(), "contribready-issue-"));
  const issue = join(root, "issue.md");
  writeFileSync(issue, "# Reproducible setup failure\n\nRun the documented command.\n");
  const result = invoke(["issue", issue, "--format", "json"]);
  assert.equal(result.code, 0);
  const report = JSON.parse(result.stdout);
  assert.equal(report.subject, "issue");
  assert.equal(report.title, "Reproducible setup failure");
  assert.equal(report.findings.length, 6);
  assert.equal(report.score.percentage, 33);
  assert.equal(invoke(["issue", issue, "--strict"]).code, 1);
});

test("issue command passes a complete actionable issue", () => {
  const root = mkdtempSync(join(tmpdir(), "contribready-complete-issue-"));
  const issue = join(root, "issue.md");
  writeFileSync(issue, `# Parser fails on empty input

Context: the parser throws an error for an empty document.

Steps to reproduce:
1. Run npm test.
2. Use the empty fixture.

Expected behavior: return an empty result. Actual behavior: the parser crashes.

Affected module: src/parser.

Acceptance criteria:
- The empty fixture returns an empty result.
- Existing inputs remain unchanged.

Definition of done: tests pass and documentation is updated.
`);
  const result = invoke(["issue", issue, "--format", "json", "--strict"]);
  assert.equal(result.code, 0);
  const report = JSON.parse(result.stdout);
  assert.equal(report.score.percentage, 100);
  assert.equal(report.findings.every((finding) => finding.outcome === "pass"), true);
});

test("invalid input returns a usage/input error without a stack trace", () => {
  const result = invoke(["audit", "does-not-exist", "--format", "json"]);
  assert.equal(result.code, 2);
  assert.match(result.stderr, /\"code\": \"INPUT\"/);
  assert.doesNotMatch(result.stderr, /at .*\.js/);
});

test("human output strips terminal control characters from untrusted report text", () => {
  const report = {
    subject: "issue",
    findings: [{ outcome: "fail", rule: { id: "CR-ISSUE-001" }, message: "Bad\u001b[31m\nInjected", evidence: [{ source: "file\u001b[2J" }], recommendation: "Fix it" }],
    score: { percentage: 0 },
    recommendations: [{ priority: "high", ruleId: "CR-ISSUE-001", text: "Fix it" }],
  };
  const output = renderReport(report, "text", "https://github.com/acme/project/issues/1");
  assert.doesNotMatch(output, /\u001b/);
  assert.match(output, /Bad Injected/);
});

test("SARIF output is stable and maps findings to rules and levels", () => {
  const root = mkdtempSync(join(tmpdir(), "contribready-sarif-"));
  writeFileSync(join(root, "README.md"), "Project overview");
  const result = invoke(["audit", root, "--format", "sarif"]);
  assert.equal(result.code, 0);
  const sarif = JSON.parse(result.stdout);
  assert.equal(sarif.version, "2.1.0");
  assert.equal(sarif.runs.length, 1);
  assert.equal(sarif.runs[0].tool.driver.name, "ContribReady");
  assert.equal(sarif.runs[0].results.some((item) => item.level === "error" && item.ruleId === "CR-CONTRIB-001"), true);
  assert.equal(sarif.runs[0].results.some((item) => item.level === "warning"), true);
});
