import { CliError } from "./errors.js";

export interface ParsedArguments {
  readonly command?: "audit" | "issue";
  readonly target: string;
  readonly format: "text" | "json" | "sarif";
  readonly strict: boolean;
  readonly help: boolean;
  readonly version: boolean;
}

export function parseArguments(argv: readonly string[]): ParsedArguments {
  if (argv.length === 0) return { target: "", format: "text", strict: false, help: false, version: false };
  if (argv.includes("--help") || argv.includes("-h")) return { target: "", format: "text", strict: false, help: true, version: false };
  if (argv.includes("--version") || argv.includes("-v")) return { target: "", format: "text", strict: false, help: false, version: true };

  const command = argv[0];
  if (command !== "audit" && command !== "issue") throw new CliError("USAGE", `Unknown command: ${command}`);
  let target = "";
  let format: "text" | "json" | "sarif" = "text";
  let strict = false;
  for (let index = 1; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--strict") { strict = true; continue; }
    if (value === "--format" || value === "-f") {
      const next = argv[++index];
      if (next !== "text" && next !== "json" && next !== "sarif") throw new CliError("USAGE", "--format must be text, json, or sarif");
      format = next;
      continue;
    }
    if (value.startsWith("--format=")) {
      const next = value.slice("--format=".length);
      if (next !== "text" && next !== "json" && next !== "sarif") throw new CliError("USAGE", "--format must be text, json, or sarif");
      format = next;
      continue;
    }
    if (value.startsWith("-")) throw new CliError("USAGE", `Unknown option: ${value}`);
    if (target) throw new CliError("USAGE", "Only one input path is allowed");
    target = value;
  }
  if (!target) throw new CliError("USAGE", `${command} requires an input path`);
  return { command, target, format, strict, help: false, version: false };
}
