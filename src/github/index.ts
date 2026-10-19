import { buildEvidenceIndex, classifyEvidencePath } from "@contribready/core";
import type { IssueEvidence, RepositoryEvidence } from "@contribready/core";
import { CliError } from "../errors.js";

export interface GitHubRepositoryRef { readonly owner: string; readonly repository: string; }
export interface GitHubIssueRef extends GitHubRepositoryRef { readonly number: number; }

export interface GitHubResponse {
  readonly status: number;
  readonly headers?: { get(name: string): string | null };
  readonly body?: ReadableStream<Uint8Array> | null;
  text(): Promise<string>;
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
  if (url.protocol !== "https:" || url.hostname !== "github.com" || url.port || url.username || url.password || url.search || url.hash) return null;
  const parts = url.pathname.split("/").filter(Boolean);
  return parts;
}

export function parseIssueUrl(input: string): GitHubIssueRef | null {
  try {
    const url = new URL(input);
    const parts = githubParts(url);
    const repository = parts && parts.length >= 2 && validOwner(parts[0]) && validRepository(parts[1]) ? { owner: parts[0], repository: parts[1] } : null;
    if (!repository || !parts || repository.repository === "." || repository.repository === ".." || parts.length !== 4 || parts[2] !== "issues" || !/^\d+$/.test(parts[3]) || url.pathname !== `/${parts.join("/")}` || input !== `https://github.com${url.pathname}`) return null;
    const number = Number(parts[3]);
    return Number.isSafeInteger(number) && number > 0 ? { ...repository, number } : null;
  } catch { return null; }
}

export function parseRepositoryUrl(input: string): GitHubRepositoryRef | null {
  try {
    const url = new URL(input);
    const parts = githubParts(url);
    return parts && parts.length === 2 && validOwner(parts[0]) && validRepository(parts[1]) && parts[1] !== "." && parts[1] !== ".." && url.pathname === `/${parts.join("/")}` && input === `https://github.com${url.pathname}` ? { owner: parts[0], repository: parts[1] } : null;
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
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await withAbort(fetcher(url, { headers: tokenHeaders(token), signal: controller.signal, redirect: "error" }), controller.signal);

    if (response.status === 401) throw new CliError("AUTH", "GitHub rejected the configured authentication");
    if (response.status === 403 || response.status === 429) {
      const remaining = response.headers?.get("x-ratelimit-remaining");
      if (response.status === 429 || remaining === "0") throw new CliError("RATE_LIMIT", "GitHub rate limit exceeded; try again later or configure GITHUB_TOKEN");
      throw new CliError("AUTH", "GitHub denied access to this resource");
    }
    if (response.status === 404) throw new CliError("NOT_FOUND", "GitHub resource was not found or is private");
    if (response.status < 200 || response.status >= 300) throw new CliError("NETWORK", `GitHub returned an unexpected response (${response.status})`);
    const length = response.headers?.get("content-length");
    if (length !== null && length !== undefined) {
      if (!/^\d+$/.test(length)) throw new CliError("NETWORK", "GitHub returned an invalid response length");
      if (Number(length) > MAX_JSON_BYTES) throw new CliError("NETWORK", "GitHub response exceeded the bounded response limit");
    }
    const raw = await readResponseText(response, controller.signal);
    let value: unknown;
    try { value = JSON.parse(raw); }
    catch { throw new CliError("NETWORK", "GitHub returned invalid JSON"); }
    if (new TextEncoder().encode(JSON.stringify(value)).byteLength > MAX_JSON_BYTES) throw new CliError("NETWORK", "GitHub response exceeded the bounded response limit");
    return value;
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw new CliError("NETWORK", "GitHub could not be reached or the request timed out");
  } finally { clearTimeout(timer); }
}

function withAbort<T>(operation: Promise<T>, signal: AbortSignal, cancel?: () => void): Promise<T> {
  if (signal.aborted) {
    cancel?.();
    return Promise.reject(new Error("request aborted"));
  }
  let onAbort: (() => void) | undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () => { reject(new Error("request aborted")); cancel?.(); };
    signal.addEventListener("abort", onAbort, { once: true });
  });
  return Promise.race([operation, aborted]).finally(() => {
    if (onAbort) signal.removeEventListener("abort", onAbort);
  });
}

async function readResponseText(response: GitHubResponse, signal: AbortSignal): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) throw new CliError("NETWORK", "GitHub response body was unavailable for bounded reading");
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await withAbort(reader.read(), signal, () => { void reader.cancel().catch(() => undefined); });
      if (done) break;
      total += value.byteLength;
      if (total > MAX_JSON_BYTES) {
        await reader.cancel();
        throw new CliError("NETWORK", "GitHub response exceeded the bounded response limit");
      }
      chunks.push(value);
    }
  } finally { try { reader.releaseLock(); } catch { /* A timed-out reader may still be cancelling. */ } }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { throw new CliError("NETWORK", "GitHub returned invalid UTF-8"); }
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

function decodeBase64(value: string): { readonly text: string; readonly bytes: number } | undefined {
  try {
    const binary = atob(value.replace(/\s/g, ""));
    if (binary.length > MAX_REMOTE_FILE_BYTES) return undefined;
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(bytes), bytes: bytes.byteLength };
  } catch { return undefined; }
}

export async function loadGithubRepository(input: string, options: { readonly token?: string; readonly fetcher?: GitHubFetch } = {}): Promise<RepositoryEvidence> {
  const ref = parseRepositoryUrl(input);
  if (!ref) throw new CliError("INPUT", "Expected a canonical HTTPS GitHub repository URL");
  const fetcher = options.fetcher ?? defaultFetch();
  const token = safeToken(options.token ?? tokenFromEnvironment());
  const metadata = await fetchJson(apiPath(ref, ""), token, fetcher);
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) throw new CliError("NETWORK", "GitHub returned invalid repository metadata");
  const branchValue = (metadata as { default_branch?: unknown }).default_branch;
  if (typeof branchValue !== "string" || !branchValue || branchValue.length > 256) throw new CliError("NETWORK", "GitHub returned invalid repository metadata");
  const branch = branchValue;
  const tree = await fetchJson(`${apiPath(ref, `/git/trees/${encodeURIComponent(branch)}?recursive=1`)}`, token, fetcher);
  if (!tree || typeof tree !== "object" || Array.isArray(tree) || !Array.isArray((tree as { tree?: unknown }).tree)) throw new CliError("NETWORK", "GitHub returned an invalid repository tree");
  const treeData = tree as { tree: readonly TreeEntry[]; truncated?: unknown };
  const candidates = treeData.tree.filter((entry): entry is TreeEntry & { path: string; sha: string } => Boolean(entry) && typeof entry.path === "string" && typeof entry.sha === "string" && entry.type === "blob" && !entry.path.startsWith("/") && !entry.path.includes("\\") && !entry.path.split("/").some((segment) => !segment || segment === ".." || segment === ".") && classifyEvidencePath(entry.path) !== null).sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0).slice(0, MAX_REMOTE_FILES);
  const files: Record<string, string> = {};
  let bytes = 0;
  for (const entry of candidates) {
    const blobValue = await fetchJson(apiPath(ref, `/git/blobs/${encodeURIComponent(entry.sha)}`), token, fetcher);
    if (!blobValue || typeof blobValue !== "object" || Array.isArray(blobValue)) throw new CliError("NETWORK", "GitHub returned an invalid repository blob");
    const blob = blobValue as BlobResponse;
    if (blob.encoding !== "base64" || typeof blob.content !== "string") continue;
    const value = decodeBase64(blob.content);
    if (value === undefined || bytes + value.bytes > MAX_REMOTE_TOTAL_BYTES) continue;
    files[entry.path.replaceAll("\\", "/")] = value.text;
    bytes += value.bytes;
  }
  return { files, inventory: buildEvidenceIndex(files), metadata: { source: input, owner: ref.owner, repository: ref.repository, defaultBranch: branch, discoveredFiles: String(Object.keys(files).length), truncated: String(treeData.truncated === true || candidates.length === MAX_REMOTE_FILES) } };
}
