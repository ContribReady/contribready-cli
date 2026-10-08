export type CliErrorCode = "USAGE" | "INPUT" | "OUTPUT" | "NETWORK" | "AUTH" | "NOT_FOUND" | "RATE_LIMIT";

export class CliError extends Error {
  constructor(readonly code: CliErrorCode, message: string) { super(message); this.name = "CliError"; }
}

export function exitCodeFor(error: CliError): number {
  if (error.code === "OUTPUT") return 3;
  if (error.code === "NETWORK" || error.code === "AUTH" || error.code === "NOT_FOUND" || error.code === "RATE_LIMIT") return 4;
  return 2;
}
