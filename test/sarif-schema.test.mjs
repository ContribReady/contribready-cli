import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Ajv from "ajv-draft-04";
import addFormats from "ajv-formats";
import { renderError, renderSarif } from "../dist/output.js";

const schema = JSON.parse(readFileSync(new URL("./schemas/sarif-schema-2.1.0.json", import.meta.url), "utf8"));
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(schema);

function sarifFor(outcomes, evidencePath = "docs/guide.md") {
  const findings = outcomes.map((outcome, index) => ({
    outcome,
    rule: {
      id: `CR-TEST-${String(index + 1).padStart(3, "0")}`,
      name: `Test rule ${index + 1}`,
      purpose: "Checks documented evidence without executing repository content.",
      area: "testing",
      severity: "medium",
      version: 1,
      falsePositiveConsiderations: ["Matching text is not proof instructions work."],
      falseNegativeLimitations: ["Equivalent evidence may use different wording."],
    },
    message: `Evidence is ${outcome}: 雪 & <script>\u001b[31m`,
    evidence: [{ kind: "file", source: evidencePath }],
    evidenceMissing: ["A verified expected result."],
    conflictingEvidence: [],
    conflictsAssessed: false,
    recommendation: "Document bounded, verifiable evidence.",
  }));
  return JSON.parse(renderSarif({
    subject: "repository",
    findings,
    score: { percentage: 50, coveragePercentage: 75, passedRules: 1, failedRules: 1, unknownRules: 1, notApplicableRules: 1 },
    recommendations: [],
  }, "local input with spaces", { metadata: { repeated: true } }));
}

test("SARIF 2.1.0 OASIS Errata 01 schema accepts empty, mixed, and hostile-path outputs", () => {
  for (const sarif of [
    sarifFor([]),
    sarifFor(["pass", "fail", "unknown", "not-applicable"]),
    sarifFor(["fail"], "C:\\repo\\雪% guide\t.md"),
    sarifFor(["fail"], "/repo/docs/odd name\nfile.md"),
  ]) {
    assert.equal(validate(sarif), true, JSON.stringify(validate.errors));
    assert.equal(sarif.version, "2.1.0");
    assert.equal(sarif.$schema, schema.id);
  }
});

test("SARIF-formatted CLI errors remain schema-valid and contain no terminal controls", () => {
  const sarif = JSON.parse(renderError({ code: "NETWORK", message: "request failed\u001b[31m\nsecret-safe" }, "sarif"));
  assert.equal(validate(sarif), true, JSON.stringify(validate.errors));
  assert.equal(sarif.runs[0].invocations[0].executionSuccessful, false);
  assert.match(sarif.runs[0].invocations[0].toolExecutionNotifications[0].message.text, /^NETWORK: request failed/);
  assert.doesNotMatch(sarif.runs[0].invocations[0].toolExecutionNotifications[0].message.text, /\u001b/);
});
