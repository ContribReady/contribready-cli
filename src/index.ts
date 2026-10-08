#!/usr/bin/env node
import { parseArguments } from "./args.js";
import { CliError, exitCodeFor } from "./errors.js";
import { loadIssue, loadRepository } from "./input.js";
import { renderError, renderReport, renderUsage } from "./output.js";
import { loadGithubIssue, loadGithubRepository, parseIssueUrl, parseRepositoryUrl } from "./github/index.js";
import { coreRules, evaluateRules, makeReport } from "@contribready/core";

export const cliName = "contribready";
export const version = "0.1.0";
export const supportedCommands = ["audit", "issue"] as const;

export function usage(): string {
  return [
    "ContribReady — contributor-readiness analysis",
    "",
    "Usage:",
    "  contribready audit <repository-path-or-github-url> [--format text|json|sarif] [--strict]",
    "  contribready issue <markdown-path-or-github-url> [--format text|json|sarif] [--strict]",
    "  contribready --help",
    "  contribready --version",
    "",
    "The default audit is static: it reads bounded, conventional files and never executes target code.",
  ].join("\n");
}

export interface CliIO { readonly stdout?: (text: string) => void; readonly stderr?: (text: string) => void; }

export function runCli(argv: readonly string[], io: CliIO = {}): number {
  const stdout = io.stdout ?? ((text: string) => process.stdout.write(text));
  const stderr = io.stderr ?? ((text: string) => process.stderr.write(text));
  try {
    const args = parseArguments(argv);
    if (args.help) { stdout(`${usage()}\n`); return 0; }
    if (args.version) { stdout(`${version}\n`); return 0; }

    if (args.command === "audit") {
      const evidence = loadRepository(args.target);
      const findings = evaluateRules({ repository: evidence }, coreRules.filter((rule) => rule.metadata.area !== "issue"));
      const report = makeReport("repository", findings);
      stdout(`${renderReport(report, args.format, args.target, { evidence: evidence.inventory, metadata: evidence.metadata })}\n`);
      return args.strict && findings.some((finding) => finding.outcome === "fail") ? 1 : 0;
    }

    if (args.command === "issue") {
      const issue = loadIssue(args.target);
      const findings = evaluateRules({ issue }, coreRules.filter((rule) => rule.metadata.area === "issue"));
      const report = makeReport("issue", findings);
      stdout(`${renderReport(report, args.format, args.target, { title: issue.title, source: issue.source, ...(issue.details ? { metadata: issue.details } : {}) })}\n`);
      return args.strict && findings.some((finding) => finding.outcome === "fail") ? 1 : 0;
    }

    throw new CliError("USAGE", "A command is required. Use --help for usage.");
  } catch (error) {
    const cliError = error instanceof CliError ? error : new CliError("INPUT", error instanceof Error ? error.message : "Unexpected error");
    stderr(`${renderError(cliError, parseFormat(argv))}\n`);
    return exitCodeFor(cliError);
  }
}

export async function runCliAsync(argv: readonly string[], io: CliIO = {}): Promise<number> {
  const stdout = io.stdout ?? ((text: string) => process.stdout.write(text));
  const stderr = io.stderr ?? ((text: string) => process.stderr.write(text));
  try {
    const args = parseArguments(argv);
    if (args.help) { stdout(`${usage()}\n`); return 0; }
    if (args.version) { stdout(`${version}\n`); return 0; }

    if (args.command === "audit") {
      const evidence = parseRepositoryUrl(args.target) ? await loadGithubRepository(args.target) : loadRepository(args.target);
      const findings = evaluateRules({ repository: evidence }, coreRules.filter((rule) => rule.metadata.area !== "issue"));
      const report = makeReport("repository", findings);
      stdout(`${renderReport(report, args.format, args.target, { evidence: evidence.inventory, metadata: evidence.metadata })}\n`);
      return args.strict && findings.some((finding) => finding.outcome === "fail") ? 1 : 0;
    }

    if (args.command === "issue") {
      const issue = parseIssueUrl(args.target) ? await loadGithubIssue(args.target) : loadIssue(args.target);
      const findings = evaluateRules({ issue }, coreRules.filter((rule) => rule.metadata.area === "issue"));
      const report = makeReport("issue", findings);
      stdout(`${renderReport(report, args.format, args.target, { title: issue.title, source: issue.source, ...(issue.details ? { metadata: issue.details } : {}) })}\n`);
      return args.strict && findings.some((finding) => finding.outcome === "fail") ? 1 : 0;
    }

    throw new CliError("USAGE", "A command is required. Use --help for usage.");
  } catch (error) {
    const cliError = error instanceof CliError ? error : new CliError("INPUT", error instanceof Error ? error.message : "Unexpected error");
    stderr(`${renderError(cliError, parseFormat(argv))}\n`);
    return exitCodeFor(cliError);
  }
}

function parseFormat(argv: readonly string[]): "text" | "json" | "sarif" {
  if (argv.includes("--format=sarif") || argv.some((value, index) => value === "--format" && argv[index + 1] === "sarif")) return "sarif";
  return argv.includes("--format=json") || argv.some((value, index) => value === "--format" && argv[index + 1] === "json") ? "json" : "text";
}

if (process.argv[1] && process.argv[1].endsWith("index.js")) {
  runCliAsync(process.argv.slice(2)).then((code) => { process.exitCode = code; });
}
