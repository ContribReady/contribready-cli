import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const npmCli = process.env.npm_execpath;
const coreTarball = resolve(
  projectRoot,
  process.env.CONTRIBREADY_CORE_TARBALL ?? "../contribready-core-0.1.0.tgz",
);

test("packed CLI installs with packed Core and runs without sibling checkouts", { timeout: 120_000 }, (t) => {
  assert.ok(npmCli && existsSync(npmCli), "run this integration test through npm so npm_execpath is available");
  assert.ok(existsSync(coreTarball), `packed Core tarball is required: ${coreTarball}`);

  const temporaryRoot = mkdtempSync(join(tmpdir(), "contribready-package-install-"));
  t.after(() => rmSync(temporaryRoot, { recursive: true, force: true }));

  const cache = join(temporaryRoot, "npm-cache");
  const packageStage = join(temporaryRoot, "packed");
  const consumer = join(temporaryRoot, "consumer");
  mkdirSync(packageStage);
  mkdirSync(consumer);
  writeFileSync(join(consumer, "package.json"), JSON.stringify({ name: "contribready-package-smoke", private: true }));

  const env = {
    ...process.env,
    // Prevent a user-level npm allowScripts list from being forwarded to this isolated project install.
    npm_config_allow_scripts: "",
    npm_config_audit: "false",
    npm_config_cache: cache,
    npm_config_fund: "false",
  };
  const npm = (args) => execFileSync(process.execPath, [npmCli, ...args], {
    cwd: projectRoot,
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  const packed = JSON.parse(npm(["pack", "--json", "--pack-destination", packageStage]));
  assert.equal(packed.length, 1);
  const cliTarball = join(packageStage, packed[0].filename);
  assert.ok(existsSync(cliTarball));

  // Both dependencies are local tarballs and offline mode makes accidental registry use fail closed.
  execFileSync(process.execPath, [npmCli, "install", "--prefix", consumer, "--global=false", "--offline", "--ignore-scripts", "--no-audit", "--no-fund", coreTarball, cliTarball], {
    cwd: consumer,
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  const entrypoint = join(consumer, "node_modules", "@contribready", "cli", "dist", "index.js");
  assert.ok(existsSync(entrypoint), "the installed package must contain its declared CLI entrypoint");

  const fixture = join(consumer, "fixture-repository");
  mkdirSync(join(fixture, ".github", "workflows"), { recursive: true });
  writeFileSync(join(fixture, "README.md"), "# Example\n\n## Development setup\n\nUse Node.js 20. Install with npm ci. Run tests with npm test.\n");
  writeFileSync(join(fixture, "CONTRIBUTING.md"), "# Contributing\n\nOpen a pull request and include tests for changes.\n");
  writeFileSync(join(fixture, "package.json"), JSON.stringify({ scripts: { test: "node --test" } }));
  writeFileSync(join(fixture, ".github", "workflows", "ci.yml"), "name: CI\non: [push, pull_request]\njobs:\n  test:\n    steps:\n      - run: npm test\n");

  const runCli = (args) => spawnSync(process.execPath, [entrypoint, ...args], {
    cwd: consumer,
    encoding: "utf8",
    timeout: 20_000,
    env: { ...env, GITHUB_TOKEN: "" },
  });

  const version = runCli(["--version"]);
  assert.equal(version.status, 0, version.stderr);
  assert.equal(version.stdout.trim(), "0.1.0");

  const audit = runCli(["audit", fixture]);
  assert.equal(audit.status, 0, audit.stderr);
  assert.match(audit.stdout, /ContribReady repository audit/i);

  const json = runCli(["audit", fixture, "--format", "json"]);
  assert.equal(json.status, 0, json.stderr);
  assert.equal(JSON.parse(json.stdout).subject, "repository");

  const sarif = runCli(["audit", fixture, "--format", "sarif"]);
  assert.equal(sarif.status, 0, sarif.stderr);
  assert.equal(JSON.parse(sarif.stdout).version, "2.1.0");

  const issue = join(consumer, "issue.md");
  writeFileSync(issue, "# Sparse issue\n\nThe contributor problem needs investigation.\n");
  const strictIssue = runCli(["issue", issue, "--format", "json", "--strict"]);
  assert.equal(strictIssue.status, 1, strictIssue.stderr);
  assert.equal(JSON.parse(strictIssue.stdout).subject, "issue");
});
