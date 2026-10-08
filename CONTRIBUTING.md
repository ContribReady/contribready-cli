# Contributing

Work on command behavior, local evidence loading, reports, and the CLI-owned GitHub adapter here. Keep rule logic in `@contribready/core` and add CLI integration tests.

## Workflow

Use Node.js 20, 22, or 24. Build or install the matching Core package first, then run `npm ci`, `npm run verify`, and inspect `npm pack --dry-run`. Open a focused branch and pull request that identifies the command/input boundary, test and fixture evidence, output/schema impact, and security implications.

Review requires passing CI and maintainer approval. Do not add network behavior to local-path commands. Ask usage questions through `SUPPORT.md`; report vulnerabilities privately through `SECURITY.md`.
