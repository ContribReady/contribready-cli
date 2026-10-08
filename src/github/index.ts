import { buildEvidenceIndex, classifyEvidencePath } from "@contribready/core";
import type { IssueEvidence, RepositoryEvidence } from "@contribready/core";
import { CliError } from "../errors.js";

export interface GitHubRepositoryRef { readonly owner: string; readonly repository: string; }
export interface GitHubIssueRef extends GitHubRepositoryRef { readonly number: number; }

export interface GitHubResponse {
  readonly status: number;
  readonly headers?: { get(name: string): string | null };
  json(): Promise<unknown>;
}

export type GitHubFetch = (input: string, init?: { readonly headers?: Readonly<Record<string, string>>; readonly signal?: AbortSignal; readonly redirect?: "error" }) => Promise<GitHubResponse>;

const API_ROOT = "https://api.github.com";
const MAX_REMOTE_FILES = 64;
const MAX_REMOTE_FILE_BYTES = 256 * 1024;
const MAX_REMOTE_TOTAL_BYTES = 8 * 1024 * 1024;
const MAX_JSON_BYTES = 4 * 1024 * 1024;

function validOwner(value: string): boolean { return /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(value); }
function validRepository(value: string): boolean { return /^[A-Za-z0-9._-]{1,100}$/.test(value); }

function githubParts(url: URL): string[] | null {
  if (url.protocol !== "https:" || url.hostname !== "github.com") return null;
  const parts = url.pathname.split("/").filter(Boolean);
  return parts;
}

export function parseIssueUrl(input: string): GitHubIssueRef | null {
  try {
    const url = new URL(input);
    const parts = githubParts(url);
    const repository = parts && parts.length >= 2 && validOwner(parts[0]) && validRepository(parts[1]) ? { owner: parts[0], repository: parts[1] } : null;
    if (!repository || !parts || parts.length !== 4 || parts[2] !== "issues" || !/^\d+$/.test(parts[3])) return null;
    const number = Number(parts[3]);
    return Number.isSafeInteger(number) && number > 0 ? { ...repository, number } : null;
  } catch { return null; }
}

export function parseRepositoryUrl(input: string): GitHubRepositoryRef | null {
  try {
    const parts = githubParts(new URL(input));
    return parts && parts.length === 2 && validOwner(parts[0]) && validRepository(parts[1]) ? { owner: parts[0], repository: parts[1] } : null;
  } catch { return null; }
}

function defaultFetch(): GitHubFetch {
  if (typeof globalThis.fetch !== "function") throw new CliError("NETWORK", "GitHub retrieval requires a runtime with fetch support");
  return globalThis.fetch.bind(globalThis) as unknown as GitHubFetch;
}

function tokenHeaders(token: string | undefined): Readonly<Record<string, string>> {
  return {
    Accept: "application/vnd.github+json",
    "User-Agent": "contribready-cli/0.1.0",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function fetchJson(url: string, token: string | undefined, fetcher: GitHubFetch): Promise<unknown> {
  let response: GitHubResponse;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try { response = await fetcher(url, { headers: tokenHeaders(token), signal: controller.signal, redirect: "error" }); }
    finally { clearTimeout(timer); }
  } catch { throw new CliError("NETWORK", "GitHub could not be reached or the request timed out"); }

  if (response.status === 401) throw new CliError("AUTH", "GitHub rejected the configured authentication");
  if (response.status === 403 || response.status === 429) {
    const remaining = response.headers?.get("x-ratelimit-remaining");
    if (response.status === 429 || remaining === "0") throw new CliError("RATE_LIMIT", "GitHub rate limit exceeded; try again later or configure GITHUB_TOKEN");
    throw new CliError("AUTH", "GitHub denied access to this resource");
  }
  if (response.status === 404) throw new CliError("NOT_FOUND", "GitHub resource was not found or is private");
  if (response.status < 200 || response.status >= 300) throw new CliError("NETWORK", `GitHub returned an unexpected response (${response.status})`);
  const length = response.headers?.get("content-length");
  if (length && Number(length) > MAX_JSON_BYTES) throw new CliError("NETWORK", "GitHub response exceeded the bounded response limit");
  try {
    const value = await response.json();
    if (JSON.stringify(value).length > MAX_JSON_BYTES) throw new CliError("NETWORK", "GitHub response exceeded the bounded response limit");
    return value;
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw new CliError("NETWORK", "GitHub returned invalid JSON");
  }
}

function tokenFromEnvironment(): string | undefined {
  const token = typeof process !== "undefined" && process.env ? process.env.GITHUB_TOKEN : undefined;
  if (token && token.length > 4096) throw new CliError("AUTH", "GITHUB_TOKEN exceeds the bounded credential limit");
  return token;
}

function safeToken(token: string | undefined): string | undefined {
  if (token && token.length > 4096) throw new CliError("AUTH", "GITHUB_TOKEN exceeds the bounded credential limit");
  return token;
}

function apiPath(ref: GitHubRepositoryRef, suffix: string): string {
  return `${API_ROOT}/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repository)}${suffix}`;
}

export async function loadGithubIssue(input: string, options: { readonly token?: string; readonly fetcher?: GitHubFetch } = {}): Promise<IssueEvidence> {
  const ref = parseIssueUrl(input);
  if (!ref) throw new CliError("INPUT", "Expected a canonical HTTPS GitHub issue URL");
  const data = await fetchJson(apiPath(ref, `/issues/${ref.number}`), safeToken(options.token ?? tokenFromEnvironment()), options.fetcher ?? defaultFetch()) as { title?: unknown; body?: unknown; html_url?: unknown; pull_request?: unknown; state?: unknown; locked?: unknown; comments?: unknown; author_association?: unknown; labels?: unknown };
  if (data.pull_request) throw new CliError("INPUT", "GitHub pull requests are not accepted as issues");
  const body = data.body === null ? "" : data.body;
  if (typeof data.title !== "string" || typeof body !== "string" || new TextEncoder().encode(data.title).byteLength > MAX_REMOTE_FILE_BYTES || new TextEncoder().encode(body).byteLength > MAX_REMOTE_FILE_BYTES) throw new CliError("NETWORK", "GitHub issue response was missing bounded title/body text");
  const details: Record<string, string> = {};
  if (typeof data.state === "string") details.state = data.state;
  if (typeof data.locked === "boolean") details.locked = String(data.locked);
  if (typeof data.comments === "number" && Number.isSafeInteger(data.comments) && data.comments >= 0) details.comments = String(data.comments);
  if (typeof data.author_association === "string") details.authorAssociation = data.author_association;
  if (Array.isArray(data.labels)) details.labels = data.labels.filter((label): label is { name: string } => Boolean(label && typeof label === "object" && "name" in label && typeof label.name === "string")).map((label) => label.name).sort().join(", ");
  return { title: data.title, body, source: typeof data.html_url === "string" ? data.html_url : input, ...(Object.keys(details).length ? { details } : {}) };
}

interface TreeEntry { readonly path?: unknown; readonly type?: unknown; readonly sha?: unknown; }
interface BlobResponse { readonly content?: unknown; readonly encoding?: unknown; }

function decodeBase64(value: string): string | undefined {
  try {
    const binary = atob(value.replace(/\s/g, ""));
    if (binary.length > MAX_REMOTE_FILE_BYTES) return undefined;
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch { return undefined; }
}

export async function loadGithubRepository(input: string, options: { readonly token?: string; readonly fetcher?: GitHubFetch } = {}): Promise<RepositoryEvidence> {
  const ref = parseRepositoryUrl(input);
  if (!ref) throw new CliError("INPUT", "Expected a canonical HTTPS GitHub repository URL");
  const fetcher = options.fetcher ?? defaultFetch();
  const token = safeToken(options.token ?? tokenFromEnvironment());
  const metadata = await fetchJson(apiPath(ref, ""), token, fetcher) as { default_branch?: unknown };
  const branch = typeof metadata.default_branch === "string" && metadata.default_branch ? metadata.default_branch : "HEAD";
  const tree = await fetchJson(`${apiPath(ref, `/git/trees/${encodeURIComponent(branch)}?recursive=1`)}`, token, fetcher) as { tree?: readonly TreeEntry[]; truncated?: unknown };
  const candidates = (tree.tree ?? []).filter((entry): entry is TreeEntry & { path: string; sha: string } => typeof entry.path === "string" && typeof entry.sha === "string" && entry.type === "blob" && classifyEvidencePath(entry.path) !== null).sort((left, right) => left.path.localeCompare(right.path)).slice(0, MAX_REMOTE_FILES);
  const files: Record<string, string> = {};
  let bytes = 0;
  for (const entry of candidates) {
    const blob = await fetchJson(apiPath(ref, `/git/blobs/${encodeURIComponent(entry.sha)}`), token, fetcher) as BlobResponse;
    if (blob.encoding !== "base64" || typeof blob.content !== "string") continue;
    const value = decodeBase64(blob.content);
    if (value === undefined || bytes + value.length > MAX_REMOTE_TOTAL_BYTES) continue;
    files[entry.path.replaceAll("\\", "/")] = value;
    bytes += value.length;
  }
  return { files, inventory: buildEvidenceIndex(files), metadata: { source: input, owner: ref.owner, repository: ref.repository, defaultBranch: branch, discoveredFiles: String(Object.keys(files).length), truncated: String(tree.truncated === true || candidates.length === MAX_REMOTE_FILES) } };
}
