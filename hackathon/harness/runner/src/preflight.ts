/**
 * Fairness preflight (`01-contracts.md` §5, as amended for outside-in measurement).
 *
 *   node src/preflight.ts [--config …] [--manifest …] [--engines semantic,appdb]
 *
 * Every rule is either *verified* (a failure is a violation, which blocks `run.ts` unless `--force`) or
 * *declared* (not observable from outside; recorded in `harness_run.notes`).
 */
import { readFileSync } from "node:fs";

import pg from "pg";

import { configuredEmbedder, httpAdapter, MetabaseSession, type SearchAdapter } from "./adapter.ts";
import { isMain, loadConfig, type CorpusProbe, type Manifest, type RunnerConfig } from "./config.ts";
import { sqliteIds } from "./sqlite.ts";

export type PreflightFacts = {
  embedder: string;
  dimensions: number | null;
  /** The instance's `ee-embedding-query-prefix`, exactly as read back; null when unset (BL-33). */
  queryPrefix: string | null;
  embeddingText: string;
  /** Indexed doc count per engine, or "unverified" when the engine has no corpus probe. */
  corpus: Record<string, number | "unverified">;
};

export type PreflightReport = { ok: boolean; violations: string[]; declared: string[]; facts: PreflightFacts };

const key = (model: string, id: number | string) => `${model}:${id}`;

/** The (model, id) set an engine has indexed, via its configured probe. */
export async function probeCorpus(probe: CorpusProbe): Promise<Set<string>> {
  if (probe.kind === "sqlite") return sqliteIds(probe.path);
  if (probe.kind === "ids-file") {
    const items = JSON.parse(readFileSync(probe.path, "utf8")) as { model: string; id: number }[];
    return new Set(items.map((i) => key(i.model, i.id)));
  }
  const client = new pg.Client({ connectionString: probe.url });
  await client.connect();
  try {
    const active = await client.query<{ table_name: string }>(
      `SELECT m.table_name FROM index_metadata m JOIN index_control c ON c.active_id = m.id`,
    );
    if (active.rowCount !== 1) throw new Error(`no active semantic index in ${probe.url}`);
    // table_name comes from the index's own metadata table, not user input
    const rows = await client.query<{ model: string; model_id: string }>(
      `SELECT model, model_id FROM "${active.rows[0].table_name}"`,
    );
    return new Set(rows.rows.map((r) => key(r.model, r.model_id)));
  } finally {
    await client.end();
  }
}

/** The embedding-text variant (Agent E's axis). Instances without that setting embed the baseline text. */
export async function embeddingTextVariant(admin: MetabaseSession): Promise<string> {
  const { status, body } = await admin.request("GET", "/api/setting/search-embedding-text-variant");
  return status === 200 && typeof body === "string" && body ? body : "baseline";
}

/** Does this instance have Agent E's search-embedding-text-variant setting at all? (Other branches may not.) */
export async function embeddingTextSupported(admin: MetabaseSession): Promise<boolean> {
  const { status, body } = await admin.request("GET", "/api/setting");
  return status === 200 && Array.isArray(body) && body.some((s: { key?: string }) => s.key === "search-embedding-text-variant");
}

export async function preflight(
  cfg: RunnerConfig,
  adapters: SearchAdapter[],
  user: MetabaseSession,
  admin: MetabaseSession,
): Promise<PreflightReport> {
  const violations: string[] = [];
  // Internal settings the API never exposes, even to admins; recorded as the code defaults, assumed not overridden.
  const declared: string[] = [
    "rule 3: cosine cutoff 0.7 (index.clj max-cosine-distance, a constant) and semantic-search-results-limit 1000 " +
      "(internal setting, code default) are not observable over the API; assumed identical across engines",
    "semantic backfills with appdb when fewer than semantic-search-min-results-threshold results remain " +
      "(internal setting, code default 100): the semantic column is not purely vector",
  ];

  // Rule 4: the query user must not be a superuser, so permission filtering actually runs.
  const me = await user.get<{ email: string; is_superuser: boolean }>("/api/user/current");
  if (me.is_superuser) violations.push(`rule 4: query user ${me.email} is a superuser`);

  // Every engine column must be served by the engine it names.
  for (const a of adapters) {
    const { ready, reason } = await a.ready();
    if (!ready) {
      violations.push(
        `engine ${a.id} is not ready (${reason}). If it is "not enabled", boot Metabase with ` +
          `MB_ADDITIONAL_SEARCH_ENGINES including ${a.id}; the API cannot set it.`,
      );
    }
  }

  // Rule 2: one instance means one embedder; record it, and require one when a vector engine is measured.
  const { embedder, dimensions, queryPrefix } = await configuredEmbedder(admin);
  if (embedder === "none" && adapters.some((a) => a.id === "semantic")) {
    violations.push("rule 2: semantic engine selected but no embedder is configured (or admin session lacks access)");
  }
  const embeddingText = await embeddingTextVariant(admin);

  // Rule 1: same corpus, where observable.
  const corpus: PreflightFacts["corpus"] = {};
  const sets = new Map<string, Set<string>>();
  for (const e of cfg.engines) {
    if (!e.corpusProbe) {
      corpus[e.id] = "unverified";
      declared.push(`rule 1: engine ${e.id} exposes no corpus probe; its indexed set is unverified`);
      continue;
    }
    try {
      const s = await probeCorpus(e.corpusProbe);
      sets.set(e.id, s);
      corpus[e.id] = s.size;
    } catch (err) {
      violations.push(`rule 1: corpus probe for ${e.id} failed: ${(err as Error).message}`);
    }
  }
  const probed = [...sets.entries()];
  for (let i = 1; i < probed.length; i++) {
    const [idA, a] = probed[0];
    const [idB, b] = probed[i];
    const onlyA = [...a].filter((x) => !b.has(x));
    const onlyB = [...b].filter((x) => !a.has(x));
    if (onlyA.length || onlyB.length) {
      violations.push(
        `rule 1: ${idA} and ${idB} indexed different corpora (${onlyA.length} only in ${idA}, ` +
          `${onlyB.length} only in ${idB}; e.g. ${[...onlyA, ...onlyB].slice(0, 5).join(", ")})`,
      );
    }
  }
  // With a manifest, every corpus entity must be indexed. Extras are Metabase built-ins (usage analytics,
  // trash, personal collections), recorded rather than failed.
  if (cfg.manifest) {
    const m = JSON.parse(readFileSync(cfg.manifest, "utf8")) as Manifest & {
      entities: Record<string, { model: string; id: number }>;
    };
    const expected = new Set(Object.values(m.entities).map((x) => key(x.model, x.id)));
    for (const [id, s] of probed) {
      const missing = [...expected].filter((x) => !s.has(x));
      const extra = [...s].filter((x) => !expected.has(x));
      if (missing.length) {
        violations.push(
          `rule 1: ${id} is missing ${missing.length}/${expected.size} manifest entities ` +
            `(still indexing?) e.g. ${missing.slice(0, 5).join(", ")}`,
        );
      }
      if (extra.length) declared.push(`rule 1: ${id} indexes ${extra.length} non-corpus docs (Metabase built-ins)`);
    }
  }

  return {
    ok: violations.length === 0,
    violations,
    declared,
    facts: { embedder, dimensions, queryPrefix, embeddingText, corpus },
  };
}

export function sessionsFor(cfg: RunnerConfig) {
  const user = new MetabaseSession(cfg.baseUrl, cfg.user);
  const admin = new MetabaseSession(cfg.baseUrl, cfg.admin);
  const adapters = cfg.engines.map((e) => httpAdapter(e.id, user, admin));
  return { user, admin, adapters };
}

if (isMain(import.meta.url)) {
  const cfg = loadConfig();
  const { user, admin, adapters } = sessionsFor(cfg);
  const report = await preflight(cfg, adapters, user, admin);
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.ok ? 0 : 1;
}
