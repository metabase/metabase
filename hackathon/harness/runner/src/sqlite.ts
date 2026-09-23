/**
 * Outside-in checks for Libor's sqlite-vec1 store (`MB_SEMANTIC_SEARCH_SQLITE_PATH`), which replaces pgvector *under*
 * the semantic engine. Agreed with Agent J (hackathon/harness/branches.md, "Integration plan (v2)" and the diff-review
 * checklist).
 *
 * Everything reads the store file with the system `sqlite3 -readonly` CLI and only ever names the plain tables
 * `search_doc`, `search_vec_base` and `meta`: `search_vec` is a vec1 virtual table the CLI cannot load.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { SearchResult } from "./adapter.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Relative to a --repo checkout: what makes MB_SEMANTIC_SEARCH_SQLITE_PATH mean anything. */
export const SQLITE_STORE_SOURCE = "enterprise/backend/src/metabase_enterprise/semantic_search/sqlite.clj";
export const VEC1_DYLIB = "resources/vec1/darwin-aarch64/vec1.dylib";

/** Pinned: the probe was proven with macOS's /usr/bin/sqlite3 (3.51); Homebrew's may come first on PATH. */
export const SQLITE3 = "/usr/bin/sqlite3";

export function sqlite3Version(): string | null {
  try {
    return execFileSync(SQLITE3, ["--version"], { encoding: "utf8" }).trim().split(" ")[0];
  } catch {
    return null;
  }
}

function query(path: string, sql: string): string[][] {
  const out = execFileSync(SQLITE3, ["-readonly", "-separator", "\t", path, sql], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return out.split("\n").filter(Boolean).map((l) => l.split("\t"));
}

/** Refuse a --repo where --sqlite-vec1 would be a silent no-op (the env var only means something with this code). */
export function checkSqliteRepo(repo: string): { dylibSha256: string } {
  if (!existsSync(resolve(repo, SQLITE_STORE_SOURCE))) {
    throw new Error(`--sqlite-vec1 needs ${SQLITE_STORE_SOURCE} in --repo ${repo}; without it the store setting is ignored`);
  }
  const dylib = resolve(repo, VEC1_DYLIB);
  if (!existsSync(dylib)) throw new Error(`--sqlite-vec1 needs the native ${VEC1_DYLIB} in ${repo} (build-vec1.sh)`);
  return { dylibSha256: createHash("sha256").update(readFileSync(dylib)).digest("hex") };
}

/** Document and vector counts, or null while the file (or its schema) does not exist yet. */
export function sqliteCounts(path: string): { docs: number; vectors: number } | null {
  if (!existsSync(path)) return null;
  try {
    const [[docs, vectors]] = query(path, "select (select count(*) from search_doc), (select count(*) from search_vec_base)");
    return { docs: Number(docs), vectors: Number(vectors) };
  } catch {
    return null; // schema not created yet, or the writer holds an exclusive lock: keep polling
  }
}

/** The indexed (model, id) set, keyed like the rest of the harness: "model:id". */
export function sqliteIds(path: string): Set<string> {
  return new Set(query(path, "select model, model_id from search_doc").map(([m, id]) => `${m}:${id}`));
}

export function sqliteMeta(path: string): Record<string, string> {
  return Object.fromEntries(query(path, "select k, v from meta"));
}

/**
 * Ready = docs == vectors, every manifest entity is in search_doc, and the doc count held for two polls.
 * A failed embed batch writes neither docs nor vectors and is never retried, so equal counts alone can mean
 * "done with a hole": the manifest subset is what catches that. Times out listing what is missing.
 */
export async function waitForSqliteReady(
  path: string,
  manifestKeys: Set<string>,
  { timeoutMs = 60 * 60_000, pollMs = 5000, log = (_: string) => {} } = {},
): Promise<{ docs: number; vectors: number; extra: number }> {
  const deadline = Date.now() + timeoutMs;
  let lastDocs = -1;
  let stable = 0;
  let missing: string[] = [...manifestKeys];
  let last: { docs: number; vectors: number } | null = null;
  while (Date.now() < deadline) {
    const c = sqliteCounts(path);
    last = c ?? last;
    if (c) {
      if (c.docs !== lastDocs) log(`sqlite store: ${c.docs} docs / ${c.vectors} vectors`);
      if (c.docs === c.vectors && c.docs === lastDocs) {
        const ids = sqliteIds(path);
        missing = [...manifestKeys].filter((k) => !ids.has(k));
        if (missing.length === 0 && ++stable >= 2) return { ...c, extra: c.docs - manifestKeys.size };
      } else {
        stable = 0;
      }
      lastDocs = c.docs;
    }
    await sleep(pollMs);
  }
  throw new Error(
    `sqlite store not ready within ${timeoutMs / 60_000} min: last counts ` +
      `${last ? `${last.docs} docs / ${last.vectors} vectors` : "none (no store file or schema yet)"}; ` +
      `${missing.length} manifest entities missing (e.g. ${missing.slice(0, 10).join(", ")})`,
  );
}

/**
 * The store's embedder must be the run's embedder. `meta` is written when the store is created and reused only for
 * the same model, so a mismatch means the file came from somewhere else.
 */
export function checkStoreEmbedder(path: string, model: string | null, dimensions: number | null) {
  const meta = sqliteMeta(path);
  if (model !== null && meta.model_name !== model) {
    throw new Error(`sqlite store embeds with ${meta.model_name}, but the instance is configured for ${model}`);
  }
  if (dimensions !== null && Number(meta.vector_dimensions) !== dimensions) {
    throw new Error(`sqlite store has ${meta.vector_dimensions}-dim vectors, but the instance is configured for ${dimensions}`);
  }
  return meta;
}

const semanticDistance = (r: SearchResult) =>
  (r.allScores as { name?: string; score?: number }[]).find((s) => s.name === "semantic-distance");

/**
 * BL-34, every semantic-family column (pgvector and sqlite): when the store throws, semantic serves appdb rows
 * straight from search.engine/results, which carry no semantic-distance score at all, and still reports
 * engine=semantic. That missing entry is the fallback signature. (pgvector is hybrid: keyword-only hits
 * legitimately score 0, interleaved with vector hits, so 0 alone proves nothing there.)
 */
export function fallbackViolation(results: SearchResult[]): string | null {
  for (const [rank, r] of results.entries()) {
    const sd = semanticDistance(r);
    if (!sd || typeof sd.score !== "number") return `rank ${rank + 1} (${r.model}:${r.id}) has no semantic-distance score: store fallback`;
  }
  return null;
}

/**
 * sqlite-vec1 only (vector-only, no keyword arm): a valid response is a prefix of store rows (semantic-distance
 * > 0) followed, unless pure, by appdb top-up rows (= 0). Includes the fallback check.
 */
export function vectorOnlyViolation(results: SearchResult[], pure: boolean): string | null {
  const fallback = fallbackViolation(results);
  if (fallback) return fallback;
  let toppedUp = false;
  for (const [rank, r] of results.entries()) {
    const sd = semanticDistance(r)!;
    if (sd.score! > 0) {
      if (toppedUp) return `rank ${rank + 1} (${r.model}:${r.id}) has semantic-distance > 0 after a top-up row`;
    } else {
      if (pure) return `rank ${rank + 1} (${r.model}:${r.id}) is a top-up row (semantic-distance 0) in a pure-vector run`;
      toppedUp = true;
    }
  }
  return null;
}

/** Lines of the instance's metabase.log that prove the store failed and semantic fell back. */
export function storeErrorLines(logPath: string, extraPatterns: string[] = []): string[] {
  return logLinesMatching(logPath, ["Error executing semantic search", ...extraPatterns]);
}

export function logLinesMatching(logPath: string, patterns: string[]): string[] {
  if (!existsSync(logPath) || patterns.length === 0) return [];
  return readFileSync(logPath, "utf8")
    .split("\n")
    .filter((l) => patterns.some((p) => l.includes(p)));
}

/** Boot proof that the store is in use, from the instance's metabase.log. */
export function storeOpenedLine(logPath: string, storePath: string): string | null {
  if (!existsSync(logPath)) return null;
  return readFileSync(logPath, "utf8").split("\n").find((l) => l.includes(`Opened SQLite semantic search store at ${storePath}`)) ?? null;
}
