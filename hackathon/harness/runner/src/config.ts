/**
 * Runner configuration: `runner.config.json` next to package.json, overridable per flag.
 *
 *   node src/run.ts --config other.json --base-url http://localhost:3010 --manifest ../corpus-gen/artifacts/x/manifest.json
 *
 * When a corpus manifest (from corpus-gen/apply.ts) is given, its `metabaseUrl`, `corpusId` and `harnessUser`
 * win over the config file: the manifest describes the instance the corpus was actually applied to.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";

export type Credentials = { username: string; password: string };

/** How preflight reads an engine's indexed (model, id) set. Engines without one are recorded as unverified. */
export type CorpusProbe =
  | { kind: "pgvector"; url: string }
  | { kind: "ids-file"; path: string }
  /** Libor's sqlite-vec1 store file: SELECT model, model_id FROM search_doc (read-only). */
  | { kind: "sqlite"; path: string };

export type EngineConfig = { id: string; corpusProbe?: CorpusProbe };

export type RunnerConfig = {
  baseUrl: string;
  /** Only used by setup.ts and preflight's read-only admin checks. Never used for timed queries. */
  admin: Credentials;
  /** The non-superuser every query runs as. */
  user: Credentials;
  engines: EngineConfig[];
  /** Path to a §3 scenario JSON file, relative to the config file. */
  scenarios: string;
  corpusId: string;
  iterations: number;
  warmup: number;
  limit: number;
  models?: string[];
  dataScale?: number | null;
  notes?: string;
  /** Path to corpus-gen's manifest.json, relative to the config file. */
  manifest?: string;
  /** The corpus.json that was applied, hashed into notes (BL-18). Default: corpus.json next to the manifest. */
  corpusFile?: string;
  /** Engine column name to record instead of the engine id, e.g. {"semantic": "semantic-pure"}. */
  engineLabels?: Record<string, string>;
  /** Overrides the declared code default when the instance was booted with a different threshold. */
  semanticMinResultsThreshold?: { value: number; source: string };
  /** The Metabase checkout that served the queries (pipeline --repo); provenance is read from it. Default: harness. */
  repo?: string;
  /**
   * BL-34 silent-fallback guard on semantic-family columns: every response is checked, and metabase.log is scanned
   * for "Error executing semantic search" before the run is finished. "fallback" = a row without a semantic-distance
   * entry (all engines); "vector-only" additionally enforces store-prefix/top-up-suffix ordering (sqlite-vec1).
   */
  semanticGuard?: {
    engines: string[];
    mode: "fallback" | "vector-only";
    pure: boolean;
    logPath: string;
    /** BL-42: fail the run when fewer non-empty responses than this share contain a vector hit. Unset = record only. */
    minLiveVectorShare?: number;
    /** More metabase.log lines that fail the run (e.g. lucene's silent keyword-arm fallback). */
    failLogPatterns?: string[];
    /** metabase.log lines that are only counted into notes (e.g. skipped embedding batches). */
    countLogPatterns?: string[];
  };
  /** Agent I's corpus text strategy label, recorded as harness_run.text_strategy (default "none"). */
  textStrategy?: string;
  /** Recorded verbatim in harness_run.notes, e.g. the pipeline's embedding-text check and re-index timing. */
  extraNotes?: Record<string, unknown>;
};

export type Manifest = {
  corpusId: string;
  metabaseUrl: string;
  harnessUser: { email: string; password: string; id: number; groupId: number };
};

const RUNNER_ROOT = resolve(import.meta.dirname, "..");

export function loadConfig(argv: string[] = process.argv.slice(2)): RunnerConfig {
  const { values } = parseArgs({
    args: argv,
    options: {
      config: { type: "string", default: resolve(RUNNER_ROOT, "runner.config.json") },
      "base-url": { type: "string" },
      manifest: { type: "string" },
      scenarios: { type: "string" },
      engines: { type: "string" },
      iterations: { type: "string" },
      warmup: { type: "string" },
      force: { type: "boolean" },
    },
    strict: false,
  });
  const configPath = resolve(String(values.config));
  const base = dirname(configPath);
  const cfg = JSON.parse(readFileSync(configPath, "utf8")) as RunnerConfig;

  // Flags resolve against the cwd; config-file paths against the config file.
  cfg.scenarios = values.scenarios ? resolve(String(values.scenarios)) : resolve(base, cfg.scenarios);
  const manifestPath = values.manifest ? resolve(String(values.manifest)) : cfg.manifest && resolve(base, cfg.manifest);
  for (const e of cfg.engines) {
    if (e.corpusProbe?.kind === "ids-file") e.corpusProbe.path = resolve(base, e.corpusProbe.path);
  }

  if (manifestPath) {
    const m = JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest;
    cfg.manifest = manifestPath;
    cfg.baseUrl = m.metabaseUrl;
    cfg.corpusId = m.corpusId;
    cfg.user = { username: m.harnessUser.email, password: m.harnessUser.password };
  }
  if (values["base-url"]) cfg.baseUrl = String(values["base-url"]);
  if (values.engines) {
    const wanted = String(values.engines).split(",");
    cfg.engines = wanted.map((id) => cfg.engines.find((e) => e.id === id) ?? { id });
  }
  if (values.iterations) cfg.iterations = Number(values.iterations);
  if (values.warmup) cfg.warmup = Number(values.warmup);
  cfg.baseUrl = cfg.baseUrl.replace(/\/$/, "");
  return cfg;
}

export function forceFlag(argv: string[] = process.argv.slice(2)): boolean {
  return argv.includes("--force");
}

/** True when `metaUrl`'s module is the script node was started with (import.meta.main is Node ≥ 24). */
export function isMain(metaUrl: string): boolean {
  return process.argv[1] !== undefined && resolve(process.argv[1]) === new URL(metaUrl).pathname;
}
