# Changelog

## Unreleased

- Added the public one-command npm quick start and explicit Node.js 20+, package-content, repository, and public-access metadata for the first registry release.
- Updated the development-only SARIF schema validator from Ajv 8.17.1 to 8.20.0 to resolve the current moderate ReDoS advisory.
- Verify the opened file's device/inode matches its pre-open `lstat` snapshot before reading, preventing a path replacement from redirecting bounded evidence reads on platforms without `O_NOFOLLOW`.
- Add an offline clean-consumer release-candidate test: pack CLI, install it with the packed Core artifact with lifecycle scripts disabled, and exercise the installed executable for text, JSON, SARIF, issue, and strict-exit behavior without sibling checkouts.
- Text findings distinguish conflict checks that ran with no detected incompatible claims from rules that did not assess conflicts; show source-attributed runtime conflicts without resolving their authority.
- Count local evidence limits in UTF-8 bytes, cap directory entries, and refuse symlink traversal; stream and byte-bound GitHub API responses before JSON parsing, validate canonical URLs, and include evidence limitations/coverage in reports.
- Keep the ten-second GitHub deadline active through streamed body consumption, cancel stalled readers, and keep timeout errors stable and credential-free.
- Validate SARIF output and SARIF-formatted errors against a pinned OASIS 2.1.0 Errata 01 schema with offline Ajv draft-04 tests; cover empty/mixed outcomes and hostile Windows/POSIX/Unicode paths.
- Expand regressions for per-file and aggregate UTF-8 limits, deep trees, file/entry caps, malformed UTF-8, hostile filenames, traversal-shaped GitHub tree entries, redirect refusal, and stalled header/body requests.
- Resolve Core through the public package dependency contract and verify CI against a locally packed Core tarball while npm publication remains pending.
- Text reports display determinate coverage, unknown, and not-applicable counts alongside the scoring percentage.
- Corrected the quick start to reflect unpublished npm packages and document source checkout; fixed the cross-repository security link and linked support questions to the enabled issue tracker.
- Completed Phase 2 CLI foundation: `audit`, `issue`, help/version, text/JSON output, strict mode, bounded local input handling, structured errors, and deterministic tests.
- Completed Phase 3 recursive bounded evidence discovery for documentation, manifests, lockfiles, workflows, tests, templates, and policies.
- Integrated Phase 4 setup-readiness findings into CLI audit reports.
- Integrated Phase 5 testing/reproduction findings into CLI audit reports.
- Integrated Phase 6 contribution workflow, review, support, and security findings into CLI audit reports.
- Integrated local Markdown issue-readiness evaluation and strict issue exit behavior.
- Integrated Core scoring breakdowns and prioritized recommendations into text/JSON reports.
- Completed Phase 9 GitHub adapter: canonical repository/issue URL parsing, bounded REST retrieval, optional `GITHUB_TOKEN` authentication, timeout handling, private/unavailable/rate-limit errors, and mocked transport tests.
- Completed Phase 10 hardening: control-character-safe human output, bounded remote JSON/issue data, oversized-token rejection, fixed-host redirect refusal, and abuse-focused tests.
- Added repository-specific contributor and support guidance for independent CLI onboarding.
- Added opt-in SARIF 2.1.0 rendering and additive GitHub issue metadata normalization.
