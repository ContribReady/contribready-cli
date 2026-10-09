# Security

The default CLI must remain static-first: do not execute target repository code or package scripts. Report vulnerabilities privately to project maintainers.

Local inputs are bounded and classified, terminal output strips control characters, and GitHub retrieval is opt-in with fixed-host HTTPS requests, rejected redirects, bounded responses, timeout handling, and redacted credential errors. See the main repository's [security threat model](https://github.com/ContribReady/contribready/blob/main/docs/SECURITY_THREAT_MODEL.md).

GitHub private vulnerability reporting is enabled for this repository. Do not post vulnerability details in a public issue. On the [CLI Security → Advisories page](https://github.com/ContribReady/contribready-cli/security/advisories), use **Report a vulnerability** to submit a private report.
