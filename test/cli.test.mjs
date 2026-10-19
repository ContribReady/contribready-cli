import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
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
  assert.equal(report.schemaVersion, 2);
  assert.equal(report.score.percentage, 100);
  assert.equal(report.score.coveragePercentage < 100, true);
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

test("local Markdown accepts the exact per-file UTF-8 byte limit and replaces malformed UTF-8 safely", () => {
  const root = mkdtempSync(join(tmpdir(), "contribready-file-boundary-"));
  const docs = join(root, "docs");
  mkdirSync(docs);
  writeFileSync(join(docs, "at-limit.md"), "x".repeat(256 * 1024));
  writeFileSync(join(docs, "invalid-utf8.md"), Buffer.from([0x52, 0xff, 0x50]));
  const output = invoke(["audit", root, "--format", "json"]);
  assert.equal(output.code, 0);
  const report = JSON.parse(output.stdout);
  assert.equal(report.evidence.some((file) => file.path === "docs/at-limit.md" && Number(file.bytes) === 256 * 1024), true);
  assert.equal(report.evidence.some((file) => file.path === "docs/invalid-utf8.md"), true);
  assert.doesNotMatch(output.stdout, /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/);
});

test("hostile Unicode, percent, and spacing in filenames stay inert and SARIF-encoded", () => {
  const root = mkdtempSync(join(tmpdir(), "contribready-hostile-name-"));
  const docs = join(root, "docs");
  mkdirSync(docs);
  const name = "guide 雪% name.md";
  writeFileSync(join(docs, name), "Node.js 20. Run npm ci. Run npm test.");
  const result = invoke(["audit", root, "--format", "sarif"]);
  assert.equal(result.code, 0);
  const sarif = JSON.parse(result.stdout);
  const locations = sarif.runs[0].results.flatMap((finding) => finding.locations ?? []);
  assert.equal(locations.some((location) => location.physicalLocation.artifactLocation.uri === "docs/guide%20%E9%9B%AA%25%20name.md"), true);
});

test("repository byte limits count UTF-8 bytes rather than UTF-16 code units", () => {
  const root = mkdtempSync(join(tmpdir(), "contribready-unicode-bytes-"));
  const docs = join(root, "docs");
  mkdirSync(docs);
  const multibyte = "é".repeat(128 * 1024);
  for (let index = 0; index < 40; index += 1) writeFileSync(join(docs, `guide-${String(index).padStart(2, "0")}.md`), multibyte);
  const result = invoke(["audit", root, "--format", "json"]);
  const report = JSON.parse(result.stdout);
  assert.equal(Number(report.metadata.bytesRead), 8 * 1024 * 1024);
  assert.equal(report.evidence.length, 32);
  assert.equal(report.metadata.truncated, "true");
});

test("local repository traversal does not follow symlinked directories", (t) => {
  const root = mkdtempSync(join(tmpdir(), "contribready-symlink-root-"));
  const outside = mkdtempSync(join(tmpdir(), "contribready-symlink-outside-"));
  writeFileSync(join(outside, "README.md"), "outside evidence must not be read");
  try { symlinkSync(outside, join(root, "linked"), "junction"); }
  catch { t.skip("directory symlinks are unavailable on this platform/account"); return; }
  const report = JSON.parse(invoke(["audit", root, "--format", "json"]).stdout);
  assert.equal(report.evidence.some((file) => file.path.includes("linked")), false);
  assert.equal(report.metadata.skippedFiles, "1");
});

test("local repository traversal skips symlinked files outside the selected root", (t) => {
  const root = mkdtempSync(join(tmpdir(), "contribready-file-link-root-"));
  const outside = mkdtempSync(join(tmpdir(), "contribready-file-link-outside-"));
  const outsideReadme = join(outside, "outside.md");
  writeFileSync(outsideReadme, "Node.js 20. Run npm ci and npm test.");
  try { symlinkSync(outsideReadme, join(root, "README.md"), "file"); }
  catch { t.skip("file symlinks are unavailable on this platform/account"); return; }
  const report = JSON.parse(invoke(["audit", root, "--format", "json"]).stdout);
  assert.equal(report.evidence.some((file) => file.path === "README.md"), false);
});

test("local traversal marks excessive depth and file count as truncated", () => {
  const deepRoot = mkdtempSync(join(tmpdir(), "contribready-depth-limit-"));
  let deep = deepRoot;
  for (let index = 0; index < 10; index += 1) { deep = join(deep, `d${index}`); mkdirSync(deep); }
  writeFileSync(join(deep, "README.md"), "deep evidence");
  const deepReport = JSON.parse(invoke(["audit", deepRoot, "--format", "json"]).stdout);
  assert.equal(deepReport.metadata.truncated, "true");
  assert.equal(deepReport.evidence.some((file) => file.path.endsWith("README.md")), false);

  const countRoot = mkdtempSync(join(tmpdir(), "contribready-count-limit-"));
  const docs = join(countRoot, "docs");
  mkdirSync(docs);
  for (let index = 0; index < 520; index += 1) writeFileSync(join(docs, `guide-${String(index).padStart(3, "0")}.md`), "guide");
  const countReport = JSON.parse(invoke(["audit", countRoot, "--format", "json"]).stdout);
  assert.equal(countReport.metadata.truncated, "true");
  assert.equal(countReport.evidence.length <= 512, true);
});

test("local traversal stops after the maximum directory entry count", () => {
  const root = mkdtempSync(join(tmpdir(), "contribready-entry-limit-"));
  for (let index = 0; index < 8200; index += 1) writeFileSync(join(root, `entry-${String(index).padStart(5, "0")}.bin`), "x");
  const report = JSON.parse(invoke(["audit", root, "--format", "json"]).stdout);
  assert.equal(report.metadata.truncated, "true");
  assert.equal(report.metadata.discoveredFiles, "0");
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
  assert.equal(report.score.percentage < 100, true);
  assert.equal(report.score.coveragePercentage, 100);
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

Expected behavior: return an empty result for empty input.

Actual behavior: the parser crashes for empty input.

Affected module: src/parser.

Acceptance criteria:
- The empty fixture returns an empty result.
- Existing inputs remain unchanged.

Definition of done:
- The regression test passes.
- Documentation is updated.
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
    findings: [{ outcome: "fail", rule: { id: "CR-ISSUE-001", area: "issue", severity: "medium", version: 1, falsePositiveConsiderations: [], falseNegativeLimitations: ["heuristic limitation"] }, message: "Bad\u001b[31m\nInjected", evidence: [{ source: "file\u001b[2J" }], evidenceMissing: ["steps"], conflictingEvidence: [], conflictsAssessed: false, recommendation: "Fix it" }],
    score: { percentage: 0, coveragePercentage: 100 },
    recommendations: [{ priority: "high", ruleId: "CR-ISSUE-001", text: "Fix it" }],
  };
  const output = renderReport(report, "text", "https://github.com/acme/project/issues/1");
  assert.doesNotMatch(output, /\u001b/);
  assert.match(output, /Bad Injected/);
  assert.match(output, /Determinate coverage: 100%/);
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

test("SARIF encodes hostile relative artifact paths as URIs", () => {
  const report = {
    subject: "repository",
    findings: [{ outcome: "fail", rule: { id: "CR-TEST-001", name: "Test", purpose: "purpose", area: "testing", severity: "medium", version: 1, falsePositiveConsiderations: [], falseNegativeLimitations: [] }, message: "missing", evidence: [{ source: "docs/odd name\nfile.md" }], evidenceMissing: [], conflictingEvidence: [], conflictsAssessed: false, recommendation: "add instructions" }],
    score: { percentage: 0, coveragePercentage: 100 },
    recommendations: [],
  };
  const sarif = JSON.parse(renderReport(report, "sarif", "local"));
  assert.equal(sarif.runs[0].results[0].locations[0].physicalLocation.artifactLocation.uri, "docs/odd%20name%0Afile.md");
});

test("SARIF encodes Windows, Unicode, percent, and control characters as valid artifact URIs", () => {
  for (const [source, expected] of [
    ["C:\\repo\\docs\\guide space.md", "file:///C:/repo/docs/guide%20space.md"],
    ["docs/雪% guide.md", "docs/%E9%9B%AA%25%20guide.md"],
    ["/repo/docs/tab\tname.md", "file:///repo/docs/tab%09name.md"],
  ]) {
    const report = {
      subject: "repository",
      findings: [{ outcome: "fail", rule: { id: "CR-TEST-001", name: "Test", purpose: "purpose", area: "testing", severity: "medium", version: 1, falsePositiveConsiderations: [], falseNegativeLimitations: [] }, message: "missing", evidence: [{ source }], evidenceMissing: [], conflictingEvidence: [], conflictsAssessed: false, recommendation: "add instructions" }],
      score: { percentage: 0, coveragePercentage: 100 },
      recommendations: [],
    };
    const sarif = JSON.parse(renderReport(report, "sarif", "local"));
    assert.equal(sarif.runs[0].results[0].locations[0].physicalLocation.artifactLocation.uri, expected);
  }
});
