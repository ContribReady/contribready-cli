<!-- Use real Markdown line breaks. Do not paste escaped \n text. -->

## Summary

<!-- Describe the CLI, adapter, output, or packaging change in 2–4 bullets. -->

- <!-- summary item -->

## Verification

<!-- List the exact checks run and their results. Do not claim checks that were not run. -->

- [ ] `npm run verify`
- [ ] Representative text, JSON, SARIF, and exit-code checks
- [ ] `git diff --check`

## Security and compatibility

<!-- Explain local/remote safety, credential handling, Core compatibility, and release impact. -->

- Security impact:
- Core compatibility impact:

## Documentation

<!-- Link updated documentation, or explain why no documentation change is needed. -->

- <!-- documentation link or reason not required -->

## Scope

<!-- State important exclusions and any separately tracked follow-up work. -->

- <!-- exclusion or follow-up -->

## Review checklist

- [ ] Local audits remain safe and bounded by default.
- [ ] Remote behavior is explicit, authenticated safely, and covered by tests where applicable.
- [ ] Core compatibility and sibling-repository assumptions were checked.
- [ ] Output, exit codes, docs, and security behavior were updated when needed.
