import test from "node:test";
import assert from "node:assert/strict";
import { loadGithubIssue, loadGithubRepository, parseIssueUrl, parseRepositoryUrl } from "../dist/github/index.js";

test("parses only canonical GitHub issue URLs", () => {
  assert.deepEqual(parseIssueUrl("https://github.com/acme/project/issues/42"), { owner: "acme", repository: "project", number: 42 });
  assert.deepEqual(parseRepositoryUrl("https://github.com/acme/project"), { owner: "acme", repository: "project" });
  assert.equal(parseIssueUrl("https://example.com/acme/project/issues/42"), null);
  assert.equal(parseIssueUrl("https://github.com/acme/project/pull/42"), null);
});

function response(status, value, headers = {}) {
  return { status, headers: { get: (name) => headers[name.toLowerCase()] ?? null }, json: async () => value };
}

test("GitHub issue retrieval is normalized and never exposes the token", async () => {
  let requested;
  const issue = await loadGithubIssue("https://github.com/acme/project/issues/42", {
    token: "secret-token",
    fetcher: async (url, init) => { requested = { url, init }; return response(200, { title: "Fix parser", body: "Steps and acceptance criteria" }); },
  });
  assert.deepEqual(issue, { title: "Fix parser", body: "Steps and acceptance criteria", source: "https://github.com/acme/project/issues/42" });
  assert.equal(requested.url, "https://api.github.com/repos/acme/project/issues/42");
  assert.equal(requested.init.headers.Authorization, "Bearer secret-token");
});

test("GitHub repository retrieval reads only classified bounded evidence", async () => {
  const encoded = (value) => Buffer.from(value, "utf8").toString("base64");
  const calls = [];
  const fetcher = async (url) => {
    calls.push(url);
    if (url.endsWith("/repos/acme/project")) return response(200, { default_branch: "main" });
    if (url.includes("/git/trees/main")) return response(200, { tree: [
      { path: "README.md", type: "blob", sha: "readme" },
      { path: "src/secret.ts", type: "blob", sha: "secret" },
      { path: "CONTRIBUTING.md", type: "blob", sha: "contrib" },
    ] });
    if (url.endsWith("/git/blobs/readme")) return response(200, { encoding: "base64", content: encoded("Getting started") });
    if (url.endsWith("/git/blobs/contrib")) return response(200, { encoding: "base64", content: encoded("Open a pull request") });
    throw new Error(`unexpected URL ${url}`);
  };
  const repository = await loadGithubRepository("https://github.com/acme/project", { fetcher });
  assert.deepEqual(Object.keys(repository.files), ["CONTRIBUTING.md", "README.md"]);
  assert.equal(calls.some((url) => url.includes("secret")), false);
  assert.equal(repository.metadata.defaultBranch, "main");
});

test("GitHub private and rate-limited responses become stable errors", async () => {
  await assert.rejects(() => loadGithubIssue("https://github.com/acme/project/issues/42", { fetcher: async () => response(404, {}) }), /not found or is private/);
  await assert.rejects(() => loadGithubIssue("https://github.com/acme/project/issues/42", { fetcher: async () => response(403, {}, { "x-ratelimit-remaining": "0" }) }), /rate limit exceeded/);
});

test("GitHub rejects oversized issue bodies and credentials", async () => {
  await assert.rejects(() => loadGithubIssue("https://github.com/acme/project/issues/42", { fetcher: async () => response(200, { title: "x", body: "x".repeat(256 * 1024 + 1) }) }), /bounded title\/body/);
  await assert.rejects(() => loadGithubIssue("https://github.com/acme/project/issues/42", { token: "t".repeat(4097), fetcher: async () => response(200, {}) }), /bounded credential/);
});

test("GitHub null issue bodies normalize to empty issue evidence", async () => {
  const issue = await loadGithubIssue("https://github.com/acme/project/issues/42", { fetcher: async () => response(200, { title: "Empty report", body: null }) });
  assert.equal(issue.body, "");
});

test("GitHub issue metadata is normalized without changing rule input", async () => {
  const issue = await loadGithubIssue("https://github.com/acme/project/issues/42", { fetcher: async () => response(200, { title: "Labeled issue", body: "A body", state: "open", locked: false, comments: 2, author_association: "CONTRIBUTOR", labels: [{ name: "zeta" }, { name: "bug" }] }) });
  assert.deepEqual(issue.details, { state: "open", locked: "false", comments: "2", authorAssociation: "CONTRIBUTOR", labels: "bug, zeta" });
});

test("GitHub rejects oversized JSON even without a content-length header", async () => {
  const secret = "do-not-print";
  await assert.rejects(
    () => loadGithubIssue("https://github.com/acme/project/issues/42", { token: secret, fetcher: async () => response(200, { title: "x", body: "x".repeat(4 * 1024 * 1024) }) }),
    (error) => error.message.includes("bounded response") && !error.message.includes(secret),
  );
});
