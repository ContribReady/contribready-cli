import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { basename, isAbsolute, join, normalize, relative, resolve } from "node:path";
import { buildEvidenceIndex, classifyEvidencePath } from "@contribready/core";
import type { IssueEvidence, RepositoryEvidence } from "@contribready/core";
import { CliError } from "./errors.js";

const MAX_FILE_BYTES = 256 * 1024;
const MAX_FILES = 512;
const MAX_TOTAL_BYTES = 8 * 1024 * 1024;
const SKIP_DIRECTORIES = new Set([".git", "node_modules", "dist", "build", "coverage", ".next", "vendor", "target"]);

function safePath(input: string): string {
  const absolute = resolve(input);
  if (!isAbsolute(absolute) || normalize(absolute) !== absolute) throw new CliError("INPUT", "Input path is invalid");
  return absolute;
}

function readBounded(path: string): string | undefined {
  try {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.size > MAX_FILE_BYTES) return undefined;
    return readFileSync(path, "utf8");
  } catch { return undefined; }
}

export function loadRepository(input: string): RepositoryEvidence {
  const root = safePath(input);
  let stat;
  try { stat = lstatSync(root); } catch { throw new CliError("INPUT", `Repository path does not exist: ${input}`); }
  if (!stat.isDirectory()) throw new CliError("INPUT", `Repository path is not a directory: ${input}`);
  const files: Record<string, string> = {};
  const state = { visited: 0, skipped: 0, bytes: 0, truncated: false };
  discover(root, root, files, state, 0);
  return {
    files,
    inventory: buildEvidenceIndex(files),
    metadata: {
      root,
      discoveredFiles: String(Object.keys(files).length),
      skippedFiles: String(state.skipped),
      bytesRead: String(state.bytes),
      truncated: String(state.truncated),
    },
  };
}

function discover(root: string, current: string, files: Record<string, string>, state: { visited: number; skipped: number; bytes: number; truncated: boolean }, depth: number): void {
  if (depth > 8 || state.visited >= MAX_FILES || state.bytes >= MAX_TOTAL_BYTES) { state.truncated = true; return; }
  let entries;
  try { entries = readdirSync(current, { withFileTypes: true }); } catch { state.skipped += 1; return; }
  for (const entry of entries) {
    if (state.visited >= MAX_FILES || state.bytes >= MAX_TOTAL_BYTES) { state.truncated = true; return; }
    const name = String(entry.name);
    if (entry.isDirectory() && SKIP_DIRECTORIES.has(name)) { state.skipped += 1; continue; }
    const absolute = join(current, name);
    if (entry.isDirectory()) { discover(root, absolute, files, state, depth + 1); continue; }
    if (!entry.isFile()) { state.skipped += 1; continue; }
    const relativePath = normalize(relative(root, absolute));
    if (!classifyEvidencePath(relativePath)) { state.skipped += 1; continue; }
    state.visited += 1;
    const value = readBounded(absolute);
    if (value === undefined || state.bytes + value.length > MAX_TOTAL_BYTES) { state.skipped += 1; continue; }
    files[relativePath] = value;
    state.bytes += value.length;
  }
}

export function loadIssue(input: string): IssueEvidence {
  const path = safePath(input);
  const value = readBounded(path);
  if (value === undefined) throw new CliError("INPUT", `Issue Markdown is missing, unreadable, not a regular file, or larger than ${MAX_FILE_BYTES} bytes: ${input}`);
  const lines = value.split(/\r?\n/);
  const heading = lines.find((line) => /^#\s+/.test(line));
  const title = heading ? heading.replace(/^#\s+/, "").trim() : basename(path);
  const body = heading ? lines.slice(lines.indexOf(heading) + 1).join("\n").trim() : value.trim();
  return { title, body, source: path };
}
