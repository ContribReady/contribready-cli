<div align="center">
  <img src="assets/banner.svg" alt="ContribReady CLI — safe repository audits from the command line" width="100%" />
</div>

<div align="center">
  <a href="https://github.com/ContribReady/contribready-cli/actions/workflows/ci.yml"><img src="https://github.com/ContribReady/contribready-cli/actions/workflows/ci.yml/badge.svg?branch=main" alt="CLI CI" /></a>
  <a href="https://github.com/ContribReady/contribready"><img src="https://img.shields.io/badge/Product-ContribReady-16a085" alt="ContribReady product repository" /></a>
  <a href="https://github.com/ContribReady/contribready-core"><img src="https://img.shields.io/badge/Engine-Core-6875f5" alt="ContribReady Core repository" /></a>
</div>

# @contribready/cli

The user-facing `contribready` command. It owns argument parsing, safe local filesystem discovery, terminal/JSON output, exit codes, and the optional GitHub adapter while consuming `@contribready/core`.

GitHub retrieval belongs under `src/github`; it ships with the CLI because it is currently a CLI integration rather than an independently reusable package. Core remains independent in [`contribready-core`](https://github.com/ContribReady/contribready-core). Product-level architecture and release coordination live in the main [`contribready`](https://github.com/ContribReady/contribready) repository.

## Quick start

Run a local, static repository audit with Node.js 20 or newer:

```bash
npx --yes @contribready/cli audit ./repository
npx --yes @contribready/cli audit ./repository --format json
npx --yes @contribready/cli issue ./issue.md --strict
```

For repeated use, install the executable globally with `npm install --global @contribready/cli`, then replace `npx --yes @contribready/cli` with `contribready` in the commands above.

The default audit is local-first and static: it reads bounded contributor-facing evidence and does not run the target repository, install its dependencies, or contact GitHub.

For contribution and support paths, see [CONTRIBUTING.md](CONTRIBUTING.md) and [SUPPORT.md](SUPPORT.md).

## Commands

```text
contribready audit ./repository
contribready audit ./repository --format json
contribready audit ./repository --strict
contribready issue ./issue.md --format json
contribready audit ./repository --format sarif
contribready issue https://github.com/owner/repository/issues/123 --format json
contribready audit https://github.com/owner/repository --format json
contribready --help
contribready --version
```

Phase 3 discovers bounded contributor evidence: README/documentation, manifests, lockfiles, workflows, tests, issue/PR templates, and policy files. It skips source files and dependency/build directories, and never runs repository scripts, installs repository dependencies, runs repository tests, or contacts GitHub by default.

Phase 4 applies setup rules for contributor guides, runtime versions, installation commands, development steps, and environment configuration. Findings remain evidence-based and may be `pass`, `fail`, `unknown`, or `not-applicable`.

Phase 5 applies testing rules for test commands, reproduction guidance, CI workflows, and expected results. These rules inspect evidence only; they do not execute tests or claim that CI is passing.

Phase 6 applies contribution rules for CONTRIBUTING.md, pull-request workflow, review expectations, support paths, and security reporting guidance.

Phase 7 applies six local Markdown issue-readiness rules. `issue --strict` returns exit code `1` when the issue is missing required actionable evidence.

Phase 8 reports scoring version 2, category breakdowns, determinate coverage, unknown/not-applicable counts, and deterministic prioritized recommendations from Core. The CLI does not recalculate scores. Read the percentage together with coverage: it is only the result produced by documented rules against available evidence, not an objective repository-quality or contributor-success metric.

Phase 9 adds opt-in GitHub retrieval for canonical HTTPS repository and issue URLs. Local paths never contact GitHub. Remote requests use the GitHub REST API, an optional `GITHUB_TOKEN`, bounded tree/blob selection, a ten-second request timeout, and stable errors for authentication, private/unavailable resources, rate limits, and network failures. Tokens are sent only in request headers and are never included in reports or error messages. GitHub remains a CLI adapter; it is not a separate repository.

Phase 10 hardens local and remote inputs: local resource accounting uses UTF-8 bytes and bounded directory enumeration; remote response bodies are byte-bounded before parsing; canonical GitHub URLs, redirect refusal, token bounds, terminal-control sanitization, and stable errors are tested. The proposal keeps one deadline active through response-body consumption and cancels stalled readers; `lstat` checks prevent following links and Windows junctions. The proposal CI matrix passed Node 20/22/24 on Ubuntu, Windows, and macOS. A file-symlink test skips where link creation is unavailable; file-replacement races and unusual reparse-point behavior remain unverified.

Phase 15 adds opt-in SARIF 2.1.0 output with stable rule IDs and error/warning/note mappings. The proposed remediation validates generated SARIF—including error output—against the vendored OASIS Errata 01 schema offline. It also normalizes safe GitHub issue metadata without changing readiness rules. Local and remote audits remain static; no target execution is introduced.

The 2026-10-19 review branches add a 25-case synthetic product evaluation matrix in the main repository and regression tests for deadline, resource, encoding, and output-schema boundaries. The Node/OS matrix passed, but these authored expectations are not external calibration and do not establish false-positive/false-negative rates.

For local development, clone Core and CLI as sibling repositories. Run `npm ci && npm run verify` in Core first, then run the same command in CLI; the release process and CI verify CLI against a packed Core artifact rather than a sibling source import.

The v0.1 compatibility target is Node.js 20, 22, and 24 on Ubuntu, Windows, and macOS. `npm ci && npm run verify` performs lint/typecheck, build/tests, and package dry-run. The verification suite also packs the CLI, installs it with a packed Core tarball into an isolated temporary consumer with lifecycle scripts disabled, and exercises the installed executable's text, JSON, SARIF, issue, and strict-exit behavior. The release process publishes Core before CLI, and the installed CLI resolves the declared Core version from the package registry.
