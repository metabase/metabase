/**
 * End to end on a fresh instance: boot Metabase → warehouse → corpus (B's apply.ts) → wait for indexing →
 * scenarios (B's resolve.ts) → for each embedding-text variant: preflight + matrix run → shut down.
 *
 *   node src/pipeline.ts --corpus golden [--embed-model all-minilm] [--embed-dims N] [--port 3010]
 *                        [--engines semantic,appdb,in-place] [--variants baseline,context]
 *                        [--iterations 5] [--warmup 2] [--keep] [--pure-vector] [--token-from-1password]
 *                        [--corpus-file <corpus.json>] [--text-strategy <label>]
 *
 *   --sqlite-vec1           Libor's sqlite-vec1 store under the semantic engine (MB_SEMANTIC_SEARCH_SQLITE_PATH =
 *                           <instance dir>/semantic.sqlite, no pgvector): column "sqlite-vec1" (-pure with
 *                           --pure-vector). Needs a --repo with that code and its native vec1.dylib.
 *   --sqlite-max-distance d cosine cutoff for the sqlite store (default 0.7, same as pgvector); any other value is put
 *                           into the column label (sqlite-vec1@d) so it never pools with 0.7.
 *   --lucene                Paolo's Lucene index under the semantic engine (MB_SEMANTIC_SEARCH_BACKEND=lucene, no
 *                           pgvector): column "lucene" (-pure with --pure-vector). Hybrid with the appdb keyword arm.
 *   --limit N               results per query (default 10; e.g. 1000 for an overlap probe)
 *   --purpose <text>        a diagnostic run: notes.publishable=false + notes.purpose, so it never reaches a card
 *   --repo <path>           boot Metabase from this checkout (e.g. a worktree of an engine branch) instead of the one
 *                           the harness lives in. Its path and `git describe --dirty` are recorded on the run.
 *   --corpus golden|sql|scale-<N>  sql = Agent I's northwind-sql corpus: artifacts/sql/{corpus.json,warehouse.sql}
 *                           must exist (I builds them), labels come from scenarios/src/sql.json.
 *   --corpus-file           apply this corpus.json instead of artifacts/<corpus>/corpus.json (e.g. one of I's derived
 *                           per-text-strategy corpora); it is also what the run's corpusHash is computed from.
 *   --text-strategy         label for what was written into the corpus's descriptions, recorded as
 *                           harness_run.text_strategy (default "none"); independent of --variants.
 *
 *   --pure-vector           boot with semantic-search-min-results-threshold = 0, so the semantic engine never backfills
 *                           with appdb; its column is recorded as "semantic-pure". The default measures it as shipped.
 *   --query-prefix <s>      boot with ee-embedding-query-prefix = <s> (prepended to search queries, not documents; BL-33).
 *                           The instance must report it back exactly; the embedder is then recorded as "<model>+qprefix"
 *                           and the exact string as notes.queryPrefix.
 *   --vector-only           pgvector semantic without its keyword arm (semantic-search-keyword-arm-enabled = false,
 *                           BL-35) and without the top-up (implies --pure-vector): column "semantic-vector". The instance
 *                           must report the setting back as false. Not with --sqlite-vec1 (it has no keyword arm).
 *   --token-from-1password  read the license token with the `op` CLI (the team's dev-token entry) instead of requiring it
 *                           exported. The token is only passed to the Metabase process; it is never printed or written.
 *
 * One invocation = one instance = one embedder (the embedder is fixed at boot, so an embedder change is a new
 * instance and a new run, per §5 rule 2). Everything instance-specific lives in local/pipeline/<name>/ and the
 * databases mb_pl_<name> / wh_pl_<name>, where <name> is corpus, model, "_pure" and a per-invocation suffix
 * (HHMMSS + 4 hex), so concurrent pipelines never share them. After a successful run the databases are dropped
 * (unless --keep); after a failure they and the directory are kept for inspection.
 *
 * Preconditions (checked up front, with a message saying what to do):
 *   - a license token, first found of: MB_PREMIUM_EMBEDDING_TOKEN exported; the file local/.mb-license-token
 *     (gitignored); --token-from-1password with `op` signed in.
 *     Dev tokens are *staging* tokens, so the instance also gets METASTORE_DEV_SERVER_URL and MB_RUN_MODE=dev;
 *   - docker container semantic_search-postgres-1 running (pgvector, warehouse, results DB);
 *   - ollama serving on localhost:11434 with the embed model pulled (its embedding size sets the dimensions;
 *     an explicit --embed-dims must agree);
 *   - `clojure` on PATH, and nothing listening on --port.
 */
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { existsSync, mkdirSync, openSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";

import { close } from "../../results/src/writer.ts";

import pg from "pg";

import { configuredEmbedder, MetabaseSession } from "./adapter.ts";
import { embeddingTextSupported } from "./preflight.ts";
import {
  checkSqliteRepo,
  checkStoreEmbedder,
  sqlite3Version,
  storeOpenedLine,
  waitForSqliteReady,
} from "./sqlite.ts";
import { isMain, type RunnerConfig } from "./config.ts";
import { runMatrix } from "./run.ts";

const HARNESS = resolve(import.meta.dirname, "../..");
const REPO = resolve(HARNESS, "../..");
const CORPUS_GEN = resolve(HARNESS, "corpus-gen");
const PG_CONTAINER = "semantic_search-postgres-1";
const PG = { host: "localhost", port: 55432, user: "postgres", password: "postgres" };
/** Gitignored (`/local`). Read only if MB_PREMIUM_EMBEDDING_TOKEN is not exported; never printed. */
const TOKEN_FILE = resolve(REPO, "local/.mb-license-token");
const ADMIN = { username: "pipeline-admin@metabase.local", password: "pipeline-admin-1" };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const log = (msg: string) => console.log(`[pipeline ${new Date().toISOString().slice(11, 19)}] ${msg}`);

function fail(msg: string): never {
  throw new Error(msg);
}

function psql(db: string, sql: string) {
  execFileSync("docker", ["exec", "-i", PG_CONTAINER, "psql", "-q", "-v", "ON_ERROR_STOP=1", "-U", PG.user, "-d", db], {
    input: sql,
    stdio: ["pipe", "ignore", "inherit"],
  });
}

/** Drop and recreate a database in the pgvector container. `name` is generated here, never user text. */
function freshDatabase(name: string) {
  psql("postgres", `DROP DATABASE IF EXISTS ${name} WITH (FORCE);\nCREATE DATABASE ${name};\n`);
}

/** After a successful run: wait (at most 30 s) for the JVM to exit, then drop the instance's databases. Never throws. */
async function dropDatabases(child: ChildProcess, dbs: string[]) {
  if (child.exitCode === null && child.signalCode === null) {
    await Promise.race([once(child, "exit"), new Promise((r) => setTimeout(r, 30_000).unref())]);
  }
  for (const db of dbs) {
    try {
      psql("postgres", `DROP DATABASE IF EXISTS ${db} WITH (FORCE);\n`);
      log(`dropped ${db}`);
    } catch (e) {
      log(`could not drop ${db}: ${(e as Error).message}`);
    }
  }
}

function node(script: string, args: string[]) {
  execFileSync(process.execPath, [script, ...args], { cwd: CORPUS_GEN, stdio: "inherit" });
}

/**
 * The embedding size of an Ollama model, from its metadata (`<arch>.embedding_length`), so the instance is never
 * booted with dimensions that disagree with the model (the index would never fill).
 */
export async function embeddingDimensions(model: string): Promise<number> {
  const res = await fetch("http://localhost:11434/api/show", { method: "POST", body: JSON.stringify({ model }) }).catch(
    () => fail("ollama is not serving on localhost:11434 (run: ollama serve)"),
  );
  const body = (await res.json()) as { error?: string; model_info?: Record<string, unknown> };
  if (body.error) fail(`ollama model ${model} is not available (${body.error}); run: ollama pull ${model}`);
  const entry = Object.entries(body.model_info ?? {}).find(([k]) => k.endsWith(".embedding_length"));
  if (!entry || typeof entry[1] !== "number") fail(`ollama model ${model} reports no embedding_length; is it an embedding model?`);
  return entry[1] as number;
}

async function checkPreconditions(opts: Options) {
  if (!existsSync(resolve(opts.repo, "deps.edn"))) {
    fail(`--repo ${opts.repo} is not a Metabase checkout (no deps.edn)`);
  }
  if (opts.sqliteVec1) {
    // Known statically: the engine branch has no embedding-text variant setting. Refuse before a full boot.
    if (opts.variants.some((v) => v !== "baseline")) {
      fail(`--sqlite-vec1 supports only --variants baseline (the sqlite branch has no embedding-text variant setting)`);
    }
    try {
      checkSqliteRepo(opts.repo);
    } catch (e) {
      fail((e as Error).message);
    }
    if (!sqlite3Version()) fail("--sqlite-vec1 needs /usr/bin/sqlite3 for the readiness probe");
  }
  if (opts.lucene) {
    if (!existsSync(resolve(opts.repo, LUCENE_STORE_SOURCE))) {
      fail(`--lucene needs ${LUCENE_STORE_SOURCE} in --repo ${opts.repo}; without it MB_SEMANTIC_SEARCH_BACKEND is ignored`);
    }
    if (opts.variants.some((v) => v !== "baseline")) {
      fail(`--lucene supports only --variants baseline (the lucene branch has no embedding-text variant setting)`);
    }
  }
  if (!process.env.MB_PREMIUM_EMBEDDING_TOKEN && existsSync(TOKEN_FILE)) {
    const token = readFileSync(TOKEN_FILE, "utf8").trim();
    if (!token) fail(`${TOKEN_FILE} is empty`);
    process.env.MB_PREMIUM_EMBEDDING_TOKEN = token;
  }
  if (!process.env.MB_PREMIUM_EMBEDDING_TOKEN) {
    if (!opts.tokenFrom1Password) {
      fail(
        `no license token: put it in ${TOKEN_FILE} (gitignored), export MB_PREMIUM_EMBEDDING_TOKEN, ` +
          "or pass --token-from-1password (needs `op` signed in)",
      );
    }
    try {
      // Several 1Password accounts may be signed in; the dev tokens live in the company one.
      const account = process.env.OP_ACCOUNT ?? "metabaseinc";
      const token = execFileSync("op", ["read", "--account", account, "op://Shared/Metabase License Dev Tokens/Licenses/MB_ALL_FEATURES_TOKEN"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
      if (!token) fail("1Password returned an empty license token");
      process.env.MB_PREMIUM_EMBEDDING_TOKEN = token;
    } catch {
      fail("could not read the license token from 1Password; sign in with `eval $(op signin --account metabaseinc)` " +
        "(or set OP_ACCOUNT)");
    }
  }
  try {
    execFileSync("docker", ["exec", PG_CONTAINER, "pg_isready", "-U", PG.user], { stdio: "ignore" });
  } catch {
    fail(`docker container ${PG_CONTAINER} is not running (start it with ./local/run-semantic-search.sh or docker compose)`);
  }
  const dims = await embeddingDimensions(opts.embedModel);
  if (opts.embedDims !== null && opts.embedDims !== dims) {
    fail(`--embed-dims ${opts.embedDims} does not match ${opts.embedModel}, which produces ${dims}-dimensional embeddings`);
  }
  opts.embedDims = dims;
  try {
    execFileSync("clojure", ["--version"], { stdio: "ignore" });
  } catch {
    fail("`clojure` is not on PATH");
  }
  const busy = await fetch(`http://localhost:${opts.port}/api/health`).then(() => true, () => false);
  if (busy) fail(`something is already listening on port ${opts.port}; pass --port`);
}

/** Boot a Metabase JVM with its own H2 app DB and pgvector database. Resolves once /api/health is ok. */
/** The JVM currently booting, if any: the signal handlers must stop it even before bootInstance returns. */
let bootingChild: ChildProcess | undefined;

async function bootInstance(opts: Options, dir: string, pgvectorDb: string): Promise<ChildProcess> {
  const configFile = resolve(dir, "metabase-config.yml");
  writeFileSync(
    configFile,
    `version: 1\nconfig:\n  users:\n    - first_name: Pipeline\n      last_name: Admin\n` +
      `      email: ${ADMIN.username}\n      password: ${ADMIN.password}\n`,
  );
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    MB_EDITION: "ee",
    // Dev license tokens are staging tokens; validate against staging, in dev run mode.
    METASTORE_DEV_SERVER_URL: "https://token-check.staging.metabase.com",
    MB_RUN_MODE: "dev",
    MB_DB_TYPE: "h2",
    MB_DB_FILE: resolve(dir, "app.db"),
    MB_JETTY_PORT: String(opts.port),
    MB_CONFIG_FILE_PATH: configFile,
    MB_LOAD_SAMPLE_CONTENT: "false",
    // Per instance: Metabase extracts plugins (incl. instance-analytics content) into <cwd>/plugins by default, and two
    // instances booting at once from the same --repo race on it ("Collection … was not found" at boot).
    MB_PLUGINS_DIR: resolve(dir, "plugins"),
    MB_EE_EMBEDDING_PROVIDER: "ollama",
    MB_EE_EMBEDDING_MODEL: opts.embedModel,
    MB_EE_EMBEDDING_MODEL_DIMENSIONS: String(opts.embedDims),
    MB_SEARCH_ENGINE: "semantic",
    MB_SEMANTIC_SEARCH_VECTOR_STRATEGY: "brute-force",
  };
  // in-place needs no index; semantic is the default engine. Everything else must be kept active explicitly.
  const additional = opts.engines.filter((e) => e !== "in-place" && e !== "semantic");
  if (additional.length) env.MB_ADDITIONAL_SEARCH_ENGINES = additional.join(",");
  if (opts.pureVector) env.MB_SEMANTIC_SEARCH_MIN_RESULTS_THRESHOLD = "0";
  if (opts.vectorOnly) env.MB_SEMANTIC_SEARCH_KEYWORD_ARM_ENABLED = "false";
  if (opts.queryPrefix !== null) env.MB_EE_EMBEDDING_QUERY_PREFIX = opts.queryPrefix;
  if (opts.lucene) {
    // Paolo's Lucene index replaces pgvector under semantic; it lives under <MB_PLUGINS_DIR>/semantic-search, which is
    // per instance (see above), so concurrent lucene instances never share an index.
    delete env.MB_PGVECTOR_DB_URL;
    env.MB_SEMANTIC_SEARCH_BACKEND = "lucene";
  } else if (opts.sqliteVec1) {
    // The sqlite store replaces pgvector under semantic: no pgvector URL at all, even if the caller's env has one.
    delete env.MB_PGVECTOR_DB_URL;
    env.MB_SEMANTIC_SEARCH_SQLITE_PATH = sqliteStorePath(dir);
    env.MB_SEMANTIC_SEARCH_SQLITE_MAX_DISTANCE = String(opts.sqliteMaxDistance);
  } else {
    env.MB_PGVECTOR_DB_URL = `jdbc:postgresql://${PG.host}:${PG.port}/${pgvectorDb}?user=${PG.user}&password=${PG.password}`;
  }
  // The JVM writes its log straight to a file descriptor. Never pipe it through this process: apply.ts runs via
  // execFileSync, which blocks the event loop, so a pipe would fill and every log write in Metabase would block,
  // deadlocking request threads on the log4j appender lock.
  const log = openSync(resolve(dir, "metabase.log"), "a");
  const child = spawn("clojure", ["-M:run:drivers:ee"], { cwd: opts.repo, env, stdio: ["ignore", log, log] });
  bootingChild = child; // so a signal during boot can stop this JVM (see the handlers in pipeline())

  let exited = false;
  child.on("exit", () => (exited = true));
  const deadline = Date.now() + 15 * 60_000;
  while (Date.now() < deadline) {
    if (exited) fail(`Metabase exited during boot; see ${resolve(dir, "metabase.log")}`);
    const ok = await fetch(`http://localhost:${opts.port}/api/health`)
      .then((r) => r.ok)
      .catch(() => false);
    if (ok) return child;
    await sleep(3000);
  }
  child.kill();
  fail(`Metabase did not become healthy within 15 minutes; see ${resolve(dir, "metabase.log")}`);
}

/** Poll the semantic index until it has caught up with the indexable total, and stayed there for two polls. */
async function waitForIndexing(admin: MetabaseSession, { minDelayMs = 0 } = {}) {
  await sleep(minDelayMs);
  const deadline = Date.now() + 60 * 60_000;
  // A stuck index (e.g. lucene at 249/250 with nothing left to embed) fails fast instead of holding the queue for an
  // hour: no progress for STALL_MS while short of the total is a failure, with the counts in the message.
  const STALL_MS = 5 * 60_000;
  let stable = 0;
  let last = -1;
  let lastChange = Date.now();
  while (Date.now() < deadline) {
    const { status, body } = await admin.request("GET", "/api/ee/semantic-search/status");
    const indexed = status === 200 ? (body?.indexed_count ?? 0) : 0;
    const total = status === 200 ? (body?.total_est ?? 0) : 0;
    if (total > 0 && indexed >= total && indexed === last) {
      if (++stable >= 2) return { indexed, total };
    } else {
      stable = 0;
    }
    if (indexed !== last) {
      log(`indexing: ${indexed}/${total}`);
      lastChange = Date.now();
    } else if (total > 0 && indexed < total && Date.now() - lastChange > STALL_MS) {
      fail(`semantic index stalled at ${indexed}/${total} for ${STALL_MS / 60_000} min (nothing left embedding?)`);
    }
    last = indexed;
    await sleep(5000);
  }
  fail("semantic index did not catch up within 60 minutes");
}

const sqliteStorePath = (dir: string) => resolve(dir, "semantic.sqlite");

/** Relative to a --repo checkout: what makes MB_SEMANTIC_SEARCH_BACKEND=lucene mean anything. */
const LUCENE_STORE_SOURCE = "enterprise/backend/src/metabase_enterprise/semantic_search/lucene/query.clj";

/** Bytes under the instance's Lucene index dir. Never throws. */
function luceneIndexSize(indexDir: string): Record<string, unknown> {
  try {
    const walk = (d: string): number =>
      readdirSync(d, { withFileTypes: true }).reduce(
        (n, e) => n + (e.isDirectory() ? walk(resolve(d, e.name)) : statSync(resolve(d, e.name)).size), 0);
    return { store: "lucene", dir: indexDir, bytes: walk(indexDir), includes: ["hnsw-knn"] };
  } catch (e) {
    return { store: "lucene", bytes: null, reason: (e as Error).message };
  }
}

/** BL-35 keyword-arm setting as the instance reports it; null when the instance has no such setting (older code). */
async function keywordArmEnabled(admin: MetabaseSession): Promise<boolean | null> {
  // Not GET /api/setting/<key>: that returns nothing for env-set or default values. Session properties include them.
  const value = (await admin.get<Record<string, unknown>>("/api/session/properties"))["semantic-search-keyword-arm-enabled"];
  return typeof value === "boolean" ? value : null;
}

/** Column label for the semantic engine in this instance's configuration. */
function semanticLabel(opts: Options): string {
  if (opts.vectorOnly) return "semantic-vector";
  const base = opts.lucene ? "lucene" : opts.sqliteVec1 ? "sqlite-vec1" : "semantic";
  const pure = opts.pureVector ? `${base}-pure` : base;
  return opts.sqliteVec1 && opts.sqliteMaxDistance !== 0.7 ? `${pure}@${opts.sqliteMaxDistance}` : pure;
}

/**
 * Proof that the active index was embedded with the requested text variant. Agent E's non-baseline variants add a
 * "collection: <name>" line to every non-collection document that has a collection (collections themselves embed
 * only their name), so among those docs the marked share must be ~1 for them and exactly 0 for baseline. The 0.98
 * floor only allows for E's dedup of a value repeated elsewhere in the text.
 * A count, not an existence check: a partially re-embedded index is the real failure mode.
 */
export async function variantContentGate(pgvectorUrl: string, variant: string) {
  const client = new pg.Client({ connectionString: pgvectorUrl });
  await client.connect();
  try {
    const active = await client.query<{ table_name: string }>(
      "SELECT m.table_name FROM index_metadata m JOIN index_control c ON c.active_id = m.id",
    );
    if (active.rowCount !== 1) fail("no active semantic index to check the embedding text of");
    // table_name comes from the index's own metadata table, not user input
    const { rows } = await client.query<{ with_collection: string; marked: string }>(
      `SELECT count(*) AS with_collection, count(*) FILTER (WHERE content ~ '\ncollection: ') AS marked
       FROM "${active.rows[0].table_name}"
       WHERE collection_id IS NOT NULL AND model <> 'collection'`,
    );
    const withCollection = Number(rows[0].with_collection);
    const marked = Number(rows[0].marked);
    const share = withCollection ? marked / withCollection : 0;
    const stats = { variant, withCollection, marked, share: Number(share.toFixed(3)) };
    if (variant === "baseline" ? marked !== 0 : share < 0.98) {
      fail(`embedding text of the active index does not match variant ${variant}: ${JSON.stringify(stats)}`);
    }
    return stats;
  } finally {
    await client.end();
  }
}

/**
 * BL-28: each engine's index size, measured from outside the JVM. Never throws: a size that can't be measured is
 * recorded as `bytes: null` with a reason.
 */
async function indexSizes(opts: Options, pgvectorUrl: string, dir: string): Promise<Record<string, unknown>> {
  const sizes: Record<string, unknown> = {};
  for (const engine of opts.engines) {
    if (engine === "semantic") {
      sizes[semanticLabel(opts)] = opts.lucene
        ? luceneIndexSize(resolve(dir, "plugins", "semantic-search"))
        : opts.sqliteVec1
          ? sqliteStoreSize(sqliteStorePath(dir))
          : await pgvectorIndexSize(pgvectorUrl);
    } else if (engine === "appdb") {
      sizes[engine] = { bytes: null, reason: "index lives in the H2 app DB; not measured from outside" };
    } else if (engine === "in-place") {
      sizes[engine] = { bytes: null, reason: "no index" };
    } else {
      sizes[engine] = { bytes: null, reason: "no size source for this engine" };
    }
  }
  return sizes;
}

/** The whole active index table: heap, TOAST and every index on it; `includes` says what that covers. */
async function pgvectorIndexSize(pgvectorUrl: string): Promise<Record<string, unknown>> {
  const client = new pg.Client({ connectionString: pgvectorUrl });
  try {
    await client.connect();
    const active = await client.query<{ table_name: string }>(
      "SELECT m.table_name FROM index_metadata m JOIN index_control c ON c.active_id = m.id",
    );
    if (active.rowCount !== 1) return { store: "pgvector", bytes: null, reason: "no active index" };
    // table_name comes from the index's own metadata table, not user input
    const table = active.rows[0].table_name;
    const { rows: [size] } = await client.query<{ bytes: string; rows: string }>(
      `SELECT pg_total_relation_size('"${table}"'::regclass) AS bytes, (SELECT count(*) FROM "${table}") AS rows`,
    );
    const { rows: indexes } = await client.query<{ indexname: string; indexdef: string }>(
      "SELECT indexname, indexdef FROM pg_indexes WHERE tablename = $1 ORDER BY indexname",
      [table],
    );
    const uses = (method: string) => indexes.some((i) => i.indexdef.toLowerCase().includes(`using ${method}`));
    return {
      store: "pgvector",
      table,
      bytes: Number(size.bytes),
      rows: Number(size.rows),
      includes: ["vectors", ...(uses("gin") ? ["tsvector+gin"] : []), ...(uses("hnsw") ? ["hnsw"] : [])],
      indexes: indexes.map((i) => i.indexname),
    };
  } catch (e) {
    return { store: "pgvector", bytes: null, reason: String(e) };
  } finally {
    await client.end().catch(() => {});
  }
}

/** Main file and WAL separately: the WAL's size depends on when SQLite last checkpointed. */
function sqliteStoreSize(path: string): Record<string, unknown> {
  const size = (p: string) => (existsSync(p) ? statSync(p).size : 0);
  try {
    if (!existsSync(path)) return { store: "sqlite", path, bytes: null, reason: "no store file" };
    const mainBytes = size(path);
    const walBytes = size(`${path}-wal`);
    const shmBytes = size(`${path}-shm`);
    return { store: "sqlite", path, bytes: mainBytes + walBytes + shmBytes, mainBytes, walBytes, shmBytes };
  } catch (e) {
    return { store: "sqlite", path, bytes: null, reason: String(e) };
  }
}

async function setVariant(admin: MetabaseSession, variant: string) {
  const put = await admin.request("PUT", "/api/setting/search-embedding-text-variant", { body: { value: variant } });
  if (put.status >= 300) fail(`setting embedding-text variant ${variant} failed: HTTP ${put.status} ${JSON.stringify(put.body)}`);
  const reinit = await admin.request("POST", "/api/search/re-init");
  if (reinit.status >= 300) fail(`re-init after variant ${variant} failed: HTTP ${reinit.status} ${JSON.stringify(reinit.body)}`);
}

type Options = {
  corpus: string;
  embedModel: string;
  /** null = derive from the model (the default). */
  embedDims: number | null;
  port: number;
  engines: string[];
  variants: string[];
  iterations: number;
  warmup: number;
  keep: boolean;
  pureVector: boolean;
  /** BL-35: keyword arm off; implies pureVector. */
  vectorOnly: boolean;
  /** BL-33: ee-embedding-query-prefix at boot; null = the instance's default. */
  queryPrefix: string | null;
  tokenFrom1Password: boolean;
  /** null = artifacts/<corpus>/corpus.json. */
  corpusFile: string | null;
  textStrategy: string;
  /** Results per query (the /api/search limit). 10 for every published number. */
  limit: number;
  /** A diagnostic run (e.g. "overlap probe"): recorded unpublishable, so no card ever shows it. */
  purpose: string | null;
  /** The Metabase checkout to boot. */
  repo: string;
  sqliteVec1: boolean;
  /** Paolo's Lucene index under the semantic engine (MB_SEMANTIC_SEARCH_BACKEND=lucene). */
  lucene: boolean;
  sqliteMaxDistance: number;
};

/** A bad value must fail, never reach Libor's parse-double (NaN → nil → silently 0.8; "" → 0 → empty results). */
function sqliteMaxDistance(raw: string | undefined, sqliteVec1: boolean): number {
  if (raw === undefined) return 0.7;
  if (!sqliteVec1) fail("--sqlite-max-distance only applies with --sqlite-vec1");
  const d = Number(raw);
  if (raw.trim() === "" || !Number.isFinite(d) || d <= 0 || d > 2) {
    fail(`--sqlite-max-distance must be a cosine distance in (0, 2], got ${JSON.stringify(raw)}`);
  }
  return d;
}

function positiveInt(raw: string, flag: string, max: number): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > max) fail(`${flag} must be an integer in 1..${max}, got ${JSON.stringify(raw)}`);
  return n;
}

function parseOptions(argv: string[]): Options {
  const { values } = parseArgs({
    args: argv,
    options: {
      corpus: { type: "string", default: "golden" },
      "embed-model": { type: "string", default: "all-minilm" },
      "embed-dims": { type: "string" },
      port: { type: "string", default: "3010" },
      engines: { type: "string", default: "semantic,appdb,in-place" },
      variants: { type: "string", default: "baseline" },
      iterations: { type: "string", default: "5" },
      warmup: { type: "string", default: "2" },
      keep: { type: "boolean", default: false },
      "pure-vector": { type: "boolean", default: false },
      "vector-only": { type: "boolean", default: false },
      "query-prefix": { type: "string" },
      "token-from-1password": { type: "boolean", default: false },
      "corpus-file": { type: "string" },
      "text-strategy": { type: "string", default: "none" },
      limit: { type: "string", default: "10" },
      purpose: { type: "string" },
      repo: { type: "string" },
      "sqlite-vec1": { type: "boolean", default: false },
      lucene: { type: "boolean", default: false },
      "sqlite-max-distance": { type: "string" },
    },
  });
  if (!/^(golden|sql|scale-\d+)$/.test(values.corpus!)) fail(`--corpus must be golden, sql or scale-<N>, got ${values.corpus}`);
  if (values["query-prefix"] === "") fail("--query-prefix must not be empty (omit it to use the instance default)");
  if (values["vector-only"] && values["sqlite-vec1"]) fail("--vector-only is for pgvector semantic: sqlite-vec1 has no keyword arm");
  if (values.lucene && values["sqlite-vec1"]) fail("--lucene and --sqlite-vec1 are different stores; pick one");
  if (values.lucene && values["vector-only"]) fail("--vector-only is for pgvector semantic: lucene has no keyword-arm switch");
  return {
    corpus: values.corpus!,
    embedModel: values["embed-model"]!,
    embedDims: values["embed-dims"] === undefined ? null : Number(values["embed-dims"]),
    port: Number(values.port),
    engines: values.engines!.split(","),
    variants: values.variants!.split(","),
    iterations: Number(values.iterations),
    warmup: Number(values.warmup),
    keep: values.keep!,
    pureVector: values["pure-vector"]! || values["vector-only"]!,
    vectorOnly: values["vector-only"]!,
    queryPrefix: values["query-prefix"] ?? null,
    tokenFrom1Password: values["token-from-1password"]!,
    corpusFile: values["corpus-file"] ? resolve(values["corpus-file"]) : null,
    textStrategy: values["text-strategy"]!,
    limit: positiveInt(values.limit!, "--limit", 10_000),
    purpose: values.purpose ?? null,
    repo: values.repo ? resolve(values.repo) : REPO,
    sqliteVec1: values["sqlite-vec1"]!,
    lucene: values.lucene!,
    sqliteMaxDistance: sqliteMaxDistance(values["sqlite-max-distance"], values["sqlite-vec1"]!),
  };
}

export async function pipeline(opts: Options) {
  await checkPreconditions(opts);

  const base = `${opts.corpus}_${opts.embedModel}${opts.sqliteVec1 ? "_sqlite" : ""}${opts.lucene ? "_lucene" : ""}${opts.vectorOnly ? "_vec" : opts.pureVector ? "_pure" : ""}${opts.queryPrefix === null ? "" : "_qp"}`.toLowerCase().replace(/[^a-z0-9]+/g, "_");
  // Per-invocation suffix: concurrent or repeated pipelines never clobber each other's dir and databases.
  const name = `${base}_${new Date().toISOString().slice(11, 19).replace(/:/g, "")}${randomBytes(2).toString("hex")}`;
  if (`mb_pl_${name}`.length > 63) fail(`instance name too long for a postgres identifier: mb_pl_${name}`);
  const dir = resolve(REPO, "local/pipeline", name);
  const pgvectorDb = `mb_pl_${name}`;
  const warehouseDb = `wh_pl_${name}`;
  const artifacts = resolve(HARNESS, "artifacts", opts.corpus);
  const scale = opts.corpus.startsWith("scale-") ? Number(opts.corpus.slice("scale-".length)) : null;
  const corpusJson = opts.corpusFile ?? resolve(artifacts, "corpus.json");
  // Labelled corpora resolve their scenarios from scenarios/src/<corpus>.json; scale corpora are unlabelled.
  const scenarioSrc = scale === null ? resolve(HARNESS, "scenarios/src", `${opts.corpus}.json`) : null;
  // Checked before anything is created. Only golden and scale artifacts are generated here; sql comes from Agent I.
  if (opts.corpus === "sql" && !existsSync(resolve(artifacts, "warehouse.sql"))) {
    fail(`${artifacts}/warehouse.sql is missing: build the sql corpus first (Agent I, corpus-gen generate.ts golden --source …)`);
  }
  if (opts.corpusFile && !existsSync(opts.corpusFile)) fail(`--corpus-file ${opts.corpusFile} does not exist`);
  if (scenarioSrc && !existsSync(scenarioSrc)) fail(`labels ${scenarioSrc} are missing for --corpus ${opts.corpus}`);

  log(`instance ${name}: fresh app DB in ${dir}, pgvector DB ${pgvectorDb}, port ${opts.port}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  // BL-29: gc.ts never lists an instance kept on purpose as stale.
  if (opts.keep) writeFileSync(resolve(dir, "keep"), "");
  if (!opts.sqliteVec1 && !opts.lucene) {
    freshDatabase(pgvectorDb);
    psql(pgvectorDb, "CREATE EXTENSION IF NOT EXISTS vector;\n");
  }

  if (opts.corpus !== "sql" && !existsSync(resolve(artifacts, "corpus.json"))) {
    log(`generating ${opts.corpus} artifacts`);
    node("generate.ts", scale === null ? ["golden"] : ["scale", "--data-scale", String(scale), "--seed", "42"]);
  }
  log(`warehouse ${warehouseDb}`);
  freshDatabase(warehouseDb);
  psql(warehouseDb, readFileSync(resolve(artifacts, "warehouse.sql"), "utf8"));

  // Installed before booting: a signal during boot must stop the half-booted JVM, not orphan it (it was reparented to
  // launchd and kept its port when these were only installed after boot).
  let child: ChildProcess | undefined;
  for (const [signal, code] of [["SIGINT", 130], ["SIGTERM", 143]] as const) {
    process.once(signal, () => {
      // Exits without the `finally`, so nothing is dropped: say what is left behind (BL-29).
      log(`${signal}: kept ${pgvectorDb}, ${warehouseDb} and ${dir} (interrupted runs are not cleaned up)`);
      const running = child ?? bootingChild;
      // --keep only protects a booted instance; a half-booted one is stopped regardless.
      if (running && running.exitCode === null && !(opts.keep && child)) {
        log("stopping Metabase");
        running.kill();
      }
      process.exit(code);
    });
  }

  log("booting Metabase (a few minutes)");
  // Every fresh boot validates the license against the staging token-check service; a network blip there kills the
  // boot. Retry only that failure (seen in this attempt's part of metabase.log), from a clean app DB and store.
  // Nothing is written to the results DB before boot succeeds, so a retry is safe.
  let bootAttempts = 0;
  const metabaseLog = resolve(dir, "metabase.log");
  while (!child) {
    bootAttempts++;
    const logOffset = existsSync(metabaseLog) ? statSync(metabaseLog).size : 0;
    try {
      child = await bootInstance(opts, dir, pgvectorDb);
    } catch (e) {
      const attemptLog = existsSync(metabaseLog) ? readFileSync(metabaseLog, "utf8").slice(logOffset) : "";
      const tokenCheckFailed =
        /premium-features\.token-check :: Error checking token/.test(attemptLog) && /Initialization FAILED/.test(attemptLog);
      if (!tokenCheckFailed || bootAttempts >= 3) throw e;
      log(`boot attempt ${bootAttempts} failed on the license token check (network); retrying in 60 s`);
      for (const f of ["app.db.mv.db", "app.db.trace.db", "semantic.sqlite", "semantic.sqlite-wal", "semantic.sqlite-shm"]) {
        rmSync(resolve(dir, f), { force: true });
      }
      rmSync(resolve(dir, "plugins", "semantic-search"), { recursive: true, force: true });
      if (!opts.sqliteVec1 && !opts.lucene) {
        freshDatabase(pgvectorDb);
        psql(pgvectorDb, "CREATE EXTENSION IF NOT EXISTS vector;\n");
      }
      await sleep(60_000);
    }
  }
  const booted: ChildProcess = child;
  const stop = () => {
    if (!opts.keep && booted.exitCode === null) {
      log("stopping Metabase");
      booted.kill();
    }
  };

  let succeeded = false;
  try {
    const baseUrl = `http://localhost:${opts.port}`;
    const admin = new MetabaseSession(baseUrl, ADMIN);
    const manifest = resolve(dir, "manifest.json");

    log("applying corpus (B's apply.ts)");
    node("apply.ts", [
      "--corpus", corpusJson,
      "--url", baseUrl, "--user", ADMIN.username, "--password", ADMIN.password,
      "--pg-host", PG.host, "--pg-port", String(PG.port), "--pg-db", warehouseDb,
      "--pg-user", PG.user, "--pg-password", PG.password,
      "--out", manifest,
    ]);
    let sqliteNotes: Record<string, unknown> = {};
    if (opts.sqliteVec1) {
      // Boot proof: the env var is a no-op unless the store actually opened at our path.
      // Polled: the store may open lazily on the first indexing batch rather than at boot.
      let opened: string | null = null;
      for (let t = 0; t < 120 && !(opened = storeOpenedLine(resolve(dir, "metabase.log"), sqliteStorePath(dir))); t += 2) {
        await sleep(2000);
      }
      if (!opened) fail(`no "Opened SQLite semantic search store at ${sqliteStorePath(dir)}" in metabase.log within 2 min`);
      // BL-09: semantic's status endpoint knows nothing about the sqlite store; read the store itself.
      const m = JSON.parse(readFileSync(manifest, "utf8")) as { entities: Record<string, { model: string; id: number }> };
      const manifestKeys = new Set(Object.values(m.entities).map((e) => `${e.model}:${e.id}`));
      const ready = await waitForSqliteReady(sqliteStorePath(dir), manifestKeys, { log });
      const meta = checkStoreEmbedder(sqliteStorePath(dir), opts.embedModel, opts.embedDims);
      log(`sqlite store ready: ${ready.docs} docs = vectors, all ${manifestKeys.size} manifest entities, ${ready.extra} built-ins`);
      sqliteNotes = {
        store: "sqlite-vec1",
        sqliteMaxDistance: opts.sqliteMaxDistance,
        vec1DylibSha256: checkSqliteRepo(opts.repo).dylibSha256,
        sqlite3: sqlite3Version(),
        storeMeta: meta,
        readiness: { method: "sqlite counts + manifest subset (BL-09)", ...ready },
      };
    } else if (opts.lucene) {
      // Boot proof: the backend setting is a no-op unless the Lucene index actually opened. On a lock clash the branch
      // silently falls back to a private tmp dir, so that line is a failure too.
      const logPath = resolve(dir, "metabase.log");
      let opened: string | undefined;
      for (let t = 0; t < 120; t += 2) {
        opened = readFileSync(logPath, "utf8").split("\n").find((l) => l.includes("Opened semantic search Lucene index at "));
        if (opened) break;
        await sleep(2000);
      }
      if (!opened) fail(`no "Opened semantic search Lucene index at" in metabase.log within 2 min`);
      if (readFileSync(logPath, "utf8").includes("Another process holds the semantic search Lucene index")) {
        fail("the Lucene index was locked by another process; the instance fell back to a private tmp index");
      }
      // Startup race on the lucene branch (found by Agent J): lucene/core.clj:60 populates only when the embedding
      // space is empty, and early event-driven embeds (admin setup, usage-analytics content) usually win, so init!
      // skips and pre-existing docs (e.g. collection 1 "Trash") wait for the hourly repair: 249/250 forever.
      // /api/search/re-init runs init! with :force-reset? true, which re-populates the whole corpus. (force-reindex
      // would not: semantic's reindex! is a no-op.) Done on every lucene run, for consistency.
      const reinit = await admin.request("POST", "/api/search/re-init");
      if (reinit.status >= 300) fail(`lucene re-init failed: HTTP ${reinit.status} ${JSON.stringify(reinit.body)}`);
      log("lucene: forced full re-population (POST /api/search/re-init)");
      // Lucene forks /api/ee/semantic-search/status (embedding-table count vs total_est), so the pgvector wait works.
      await waitForIndexing(admin, { minDelayMs: 10_000 });
      sqliteNotes = {
        store: "lucene",
        backend: "lucene",
        luceneIndexOpened: opened.replace(/^.*Opened semantic search Lucene index at /, "").trim(),
        // Paolo's branch sets no HNSW parameters, so Lucene 10.5.1 defaults apply (read from lucene/index.clj +
        // query.clj @917611d5): approximate kNN, unlike pgvector brute-force and sqlite flat.
        luceneIndex: {
          kind: "hnsw (approximate)",
          vectorsFormat: "Lucene99HnswVectorsFormat (default codec)",
          maxConn: 16,
          beamWidth: 100,
          similarity: "COSINE",
          k: "the search limit (KnnFloatVectorQuery k = limit)",
          scoreFloor: "0.65 on (1+cos)/2, i.e. cosine distance <= 0.7, the same cutoff as pgvector",
        },
        forcedReindex: {
          value: true,
          method: "POST /api/search/re-init (init! :force-reset? true)",
          reason: "lucene init! skips population when early event embeds exist (core.clj:60); Trash otherwise missing",
        },
      };
    } else {
      await waitForIndexing(admin);
    }
    // BL-35: the column label must match what the instance does, so read the keyword-arm setting back.
    const keywordArm = opts.sqliteVec1 || opts.lucene ? null : await keywordArmEnabled(admin);
    if (opts.vectorOnly && keywordArm !== false) {
      fail(`--vector-only: the instance reports semantic-search-keyword-arm-enabled = ${keywordArm} (needs BL-35's setting)`);
    }
    if (!opts.vectorOnly && keywordArm === false) {
      fail("the instance has the keyword arm off but --vector-only was not given, so its column would be mislabelled");
    }
    // BL-33: the embedder label comes from what the instance reports, so the prefix it reports must be the one asked for.
    if (opts.queryPrefix !== null) {
      const { queryPrefix: reported } = await configuredEmbedder(admin);
      if (reported !== opts.queryPrefix) {
        fail(`--query-prefix ${JSON.stringify(opts.queryPrefix)}: the instance reports ${JSON.stringify(reported)}`);
      }
    }

    const scenarios = resolve(dir, "scenarios.json");
    if (scenarioSrc) {
      log(`resolving ${opts.corpus} scenarios (B's resolve.ts)`);
      node("resolve.ts", ["--scenarios", scenarioSrc, "--manifest", manifest, "--out", scenarios]);
    } else {
      // Scale corpora are unlabelled: reuse the golden queries for latency and agreement, without labels.
      // scenarios/src files wrap the list: {corpusId, comment, scenarios: [...]}.
      const src = JSON.parse(readFileSync(resolve(HARNESS, "scenarios/src/golden.json"), "utf8"));
      const golden = (Array.isArray(src) ? src : src.scenarios) as any[];
      const unlabelled = golden
        .filter((s) => !s.tags.includes("empty-expected"))
        .map(({ id, query, tags, lang }) => ({ id, query, tags, lang, expected: [] }));
      writeFileSync(scenarios, JSON.stringify(unlabelled, null, 2));
    }

    const runIds: string[] = [];
    const pgvectorUrl = `postgres://${PG.user}:${PG.password}@${PG.host}:${PG.port}/${pgvectorDb}`;
    // A branch without Agent E's setting (e.g. an engine branch) cannot produce non-baseline text: refuse rather than
    // let a "context" run silently measure baseline.
    if (opts.variants.some((v) => v !== "baseline") && !(await embeddingTextSupported(admin))) {
      fail(`--variants ${opts.variants.join(",")} needs the search-embedding-text-variant setting, which ${opts.repo} does not have`);
    }
    for (const [i, variant] of opts.variants.entries()) {
      let reinitToIndexedMs: number | null = null;
      if (i > 0 || variant !== "baseline") {
        log(`switching embedding-text variant to ${variant} and re-indexing`);
        const t0 = Date.now();
        await setVariant(admin, variant);
        await waitForIndexing(admin, { minDelayMs: 10_000 });
        reinitToIndexedMs = Date.now() - t0;
        log(`re-indexed for ${variant} in ${(reinitToIndexedMs / 1000).toFixed(1)}s`);
      }
      const embeddingTextCheck = opts.lucene
        ? "n/a: lucene store"
        : opts.sqliteVec1
        ? "n/a: sqlite store"
        : await variantContentGate(pgvectorUrl, variant);
      log(`embedding text check: ${JSON.stringify(embeddingTextCheck)}`);
      const indexSize = await indexSizes(opts, pgvectorUrl, dir);
      log(`index sizes: ${JSON.stringify(indexSize)}`);
      const cfg: RunnerConfig = {
        baseUrl,
        admin: ADMIN,
        user: { username: "from-manifest", password: "from-manifest" },
        engines: opts.engines.map((id) =>
          id === "semantic"
            ? opts.lucene
              ? { id } // no outside-in probe for the Lucene index yet: recorded as "unverified"
              : { id, corpusProbe: opts.sqliteVec1 ? { kind: "sqlite", path: sqliteStorePath(dir) } : { kind: "pgvector", url: pgvectorUrl } }
            : { id },
        ),
        scenarios,
        corpusId: "from-manifest",
        iterations: opts.iterations,
        warmup: opts.warmup,
        limit: opts.limit,
        dataScale: scale,
        manifest,
        corpusFile: corpusJson,
        textStrategy: opts.textStrategy,
        repo: opts.repo,
        extraNotes: {
          embeddingTextCheck, reinitToIndexedMs, instance: name, bootAttempts, ...sqliteNotes, indexSize,
          // Every pipeline instance runs on H2; lucene's keyword arm IS the H2 appdb engine, so its numbers need this.
          appDb: "h2",
          ...(opts.purpose !== null && { publishable: false, purpose: opts.purpose }),
          ...(keywordArm !== null && {
            keywordArm: { value: keywordArm, source: opts.vectorOnly ? "env at boot (--vector-only), read back" : "read back" },
          }),
        },
        ...(semanticLabel(opts) !== "semantic" && { engineLabels: { semantic: semanticLabel(opts) } }),
        ...(opts.pureVector && {
          semanticMinResultsThreshold: { value: 0, source: `env at boot (${opts.vectorOnly ? "--vector-only" : "--pure-vector"})` },
        }),
        // BL-34 on every run: pgvector is hybrid (keyword hits score 0), so only sqlite gets the ordering rule.
        semanticGuard: {
          engines: ["semantic"],
          mode: opts.sqliteVec1 || opts.vectorOnly ? "vector-only" : "fallback",
          pure: opts.pureVector,
          logPath: resolve(dir, "metabase.log"),
          // BL-42: an empty Lucene index answers keyword-only (every row semantic-distance 0) and passes the fallback
          // check, so require the vector arm to show up in nearly every non-empty response. Recorded for all runs.
          ...(opts.lucene && {
            minLiveVectorShare: 0.95,
            // query.clj:154-156: the keyword arm fails soft and answers vector-only under the hybrid label.
            failLogPatterns: ["Keyword arm of semantic search failed"],
          }),
          // Skipped batches are only backfilled by the hourly repair job; counted so a slow readiness has an explanation.
          countLogPatterns: ["Failed to generate semantic search embeddings"],
        },
      };
      // The manifest wins for baseUrl, corpusId and user, exactly as with --manifest on the CLI.
      const m = JSON.parse(readFileSync(manifest, "utf8"));
      cfg.corpusId = m.corpusId;
      cfg.user = { username: m.harnessUser.email, password: m.harnessUser.password };

      log(`run: variant ${variant}`);
      const { runId } = await runMatrix(cfg);
      if (!runId) fail(`the ${variant} run was not finished (preflight refused, or the fallback guard or variant check failed; see above); instance left as-is in ${dir}`);
      runIds.push(runId);
    }
    log(`done: runs ${runIds.join(", ")}`);
    succeeded = true;
    return runIds;
  } finally {
    stop();
    if (opts.keep) log(`--keep: instance, ${pgvectorDb}, ${warehouseDb} and ${dir} left running/kept`);
    else if (succeeded) await dropDatabases(child, [pgvectorDb, warehouseDb]);
    else log(`failed: kept ${pgvectorDb}, ${warehouseDb} and ${dir} for inspection`);
  }
}

if (isMain(import.meta.url)) {
  try {
    await pipeline(parseOptions(process.argv.slice(2)));
  } catch (e) {
    console.error(`[pipeline] FAILED: ${(e as Error).message}`);
    process.exitCode = 1;
  } finally {
    await close();
  }
}
