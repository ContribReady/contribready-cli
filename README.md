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

The npm packages are not published yet, so the `npx` package-install route is not currently available. To run from source, check out `contribready-core` and `contribready-cli` as sibling directories, then run from their common parent:

```bash
npm ci --prefix contribready-core
npm ci --prefix contribready-cli
npm run build --prefix contribready-core
npm run build --prefix contribready-cli
node contribready-cli/dist/index.js audit ./repository
node contribready-cli/dist/index.js audit ./repository --format json
node contribready-cli/dist/index.js issue ./issue.md --strict
```

The CLI checkout expects the Core checkout at `../contribready-core`; Core is built before the CLI so its local package link resolves correctly. Once both packages are published, the standard `npx @contribready/cli ...` instructions can replace these source-checkout steps.

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

Phase 8 reports scoring version, category breakdowns, unknown/not-applicable counts, and deterministic prioritized recommendations from Core. The CLI does not recalculate scores.

Phase 9 adds opt-in GitHub retrieval for canonical HTTPS repository and issue URLs. Local paths never contact GitHub. Remote requests use the GitHub REST API, an optional `GITHUB_TOKEN`, bounded tree/blob selection, a ten-second request timeout, and stable errors for authentication, private/unavailable resources, rate limits, and network failures. Tokens are sent only in request headers and are never included in reports or error messages. GitHub remains a CLI adapter; it is not a separate repository.

Phase 10 hardens local and remote inputs: terminal control characters are removed from human output, local/remote size limits are enforced, oversized credentials are rejected, redirects are refused, and security abuse cases are covered by tests.

Phase 15 adds opt-in SARIF 2.1.0 output with stable rule IDs and error/warning/note mappings. It also normalizes safe GitHub issue metadata without changing readiness rules. Local and remote audits remain static; no target execution is introduced.

For local development, use the sibling checkout instructions above. The published package flow is not yet available because neither `@contribready/core` nor `@contribready/cli` is published.

The v0.1 compatibility target is Node.js 20, 22, and 24 on Ubuntu, Windows, and macOS. `npm ci && npm run verify` performs lint/typecheck, build/tests, and package dry-run. Before Core is published, local development and source CI must provide the compatible sibling Core repository at `../contribready-core`; the release process publishes Core before CLI. After publication, the CLI resolves the declared Core version from the package registry.
