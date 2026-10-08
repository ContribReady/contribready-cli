# Security

The default CLI must remain static-first: do not execute target repository code or package scripts. Report vulnerabilities privately to project maintainers.

Local inputs are bounded and classified, terminal output strips control characters, and GitHub retrieval is opt-in with fixed-host HTTPS requests, rejected redirects, bounded responses, timeout handling, and redacted credential errors. See the main repository's [security threat model](../contribready/docs/SECURITY_THREAT_MODEL.md).
