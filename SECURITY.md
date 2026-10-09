# Security

The default CLI must remain static-first: do not execute target repository code or package scripts. Report vulnerabilities privately to project maintainers.

Local inputs are bounded and classified, terminal output strips control characters, and GitHub retrieval is opt-in with fixed-host HTTPS requests, rejected redirects, bounded responses, timeout handling, and redacted credential errors. See the main repository's [security threat model](https://github.com/ContribReady/contribready/blob/main/docs/SECURITY_THREAT_MODEL.md).

GitHub private vulnerability reporting is not enabled for this repository at present. Do not post vulnerability details in a public issue. A maintainer must enable GitHub's private vulnerability reporting or publish a verified private contact route before external security review.
