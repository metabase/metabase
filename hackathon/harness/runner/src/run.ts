/**
 * Matrix runner: every (engine × scenario × iteration) against one instance, timed from outside.
 *
 *   node src/run.ts [--config …] [--manifest …] [--scenarios …] [--engines a,b] [--iterations 5] [--warmup 2] [--force]
 *
 * Preconditions (checked by preflight, which blocks the run unless --force):
 *   - the instance at `baseUrl` is up, and every engine is enabled (MB_ADDITIONAL_SEARCH_ENGINES at boot);
 *   - the query user exists and is not a superuser (setup.ts, or a corpus manifest);
 *   - the `harness` results DB is reachable (HARNESS_DB_URL, default localhost:55432/harness).
 *
 * Ordering: per scenario, each engine gets its warmup iterations, then timed iterations alternate across engines,
 * so drift during the run hits every column equally. One failing cell never aborts the run.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { hostname } from "node:os";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";

import { toMetricRows } from "../../metrics/src/metrics.ts";
import {
  close,
  finishRun,
  recordMetrics,
  recordQueryResults,
  recordScenarios,
  startRun,
  updateRunNotes,
  type QueryResultRow,
  type Scenario,
} from "../../results/src/writer.ts";

import type { SearchAdapter } from "./adapter.ts";
import { forceFlag, isMain, loadConfig, type RunnerConfig } from "./config.ts";
import { embeddingTextSupported, embeddingTextVariant, preflight, sessionsFor } from "./preflight.ts";
import { fallbackViolation, logLinesMatching, storeErrorLines, vectorOnlyViolation } from "./sqlite.ts";

/** `git` in `dir` (default: this process's cwd, i.e. the harness checkout). Never throws. */
function git(dir: string | undefined, ...args: string[]): string | null {
  try {
    return execFileSync("git", dir ? ["-C", dir, ...args] : args, { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

const OLLAMA_URL = (process.env.OLLAMA_URL ?? "http://localhost:11434").replace(/\/$/, "");

function sha256File(path: string | undefined, missing: string): { sha256: string | null; path?: string; reason?: string } {
  if (!path || !existsSync(path)) return { sha256: null, reason: missing };
  try {
    return { sha256: createHash("sha256").update(readFileSync(path)).digest("hex"), path };
  } catch (e) {
    return { sha256: null, path, reason: String(e) };
  }
}

/** Ollama's digest for the configured `ollama/<model>` (`/api/show` has no digest; `/api/tags` does). Never throws. */
async function embedderDigest(embedder: string): Promise<{ model: string; digest: string | null; reason?: string }> {
  const [provider, ...rest] = String(embedder).split("/");
  const model = rest.join("/");
  if (provider !== "ollama") return { model: embedder, digest: null, reason: `provider ${provider}: only ollama is looked up` };
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(5_000) });
    const { models } = (await res.json()) as { models: { name: string; digest: string }[] };
    const found = models.find((m) => m.name === model || m.name === `${model}:latest`);
    return found ? { model: found.name, digest: found.digest } : { model, digest: null, reason: `not in ${OLLAMA_URL}/api/tags` };
  } catch (e) {
    return { model, digest: null, reason: String(e) };
  }
}

/** Generated corpora carry their seed in the id (`scale-1000-seed-42`); the golden corpus is hand-written. */
function corpusSeed(corpusId: string): { value: number | null; source: string } {
  const m = /-seed-(\d+)$/.exec(corpusId);
  return m ? { value: Number(m[1]), source: "corpusId" } : { value: null, source: "no -seed-N in corpusId (golden is hand-written)" };
}

/** Quality metrics need labels; C's metrics read `expected: []` as "should return nothing". */
function hasLabels(scenarios: Scenario[]): boolean {
  return scenarios.some((s) => s.expected.length > 0 || s.tags.includes("empty-expected"));
}

async function timedCell(adapter: SearchAdapter, scenario: Scenario, cfg: RunnerConfig) {
  const t0 = performance.now();
  const outcome = await adapter.runQuery(scenario, { models: cfg.models, limit: cfg.limit });
  return { outcome, latencyMs: performance.now() - t0 };
}

export async function runMatrix(cfg: RunnerConfig, { force = false } = {}): Promise<{ runId: string | null; rows: QueryResultRow[] }> {
  const { user, admin, adapters } = sessionsFor(cfg);

  const report = await preflight(cfg, adapters, user, admin);
  if (!report.ok && !force) {
    console.error("preflight failed; refusing to run (pass --force to run anyway, marked non-publishable):");
    for (const v of report.violations) console.error(`  - ${v}`);
    process.exitCode = 1;
    return { runId: null, rows: [] };
  }

  const scenarios = JSON.parse(readFileSync(cfg.scenarios, "utf8")) as Scenario[];
  const { embedder, dimensions, queryPrefix, embeddingText } = report.facts;
  const notes = {
    publishable: report.ok,
    forced: !report.ok && force,
    violations: report.violations,
    declared: report.declared,
    corpus: report.facts.corpus,
    // Internal settings, not observable over the API: code defaults, assumed not overridden at boot.
    semanticMinResultsThreshold: cfg.semanticMinResultsThreshold ?? { value: 100, source: "declared (code default)" },
    engineLabels: cfg.engineLabels ?? {},
    semanticResultsLimit: { value: 1000, source: "declared (code default)" },
    maxCosineDistance: { value: 0.7, source: "declared (code constant)" },
    adapter: "http",
    baseUrl: cfg.baseUrl,
    iterations: cfg.iterations,
    warmup: cfg.warmup,
    limit: cfg.limit,
    models: cfg.models ?? "all",
    cache: `warm: ${cfg.warmup} discarded warmup queries per (engine, scenario)`,
    scenarioFile: cfg.scenarios,
    // Provenance (BL-18): exactly what code, model and inputs ran. Scorer names are added after the run.
    // The Metabase checkout that served the queries (pipeline --repo), and the harness checkout, which may differ.
    repo: git(cfg.repo, "rev-parse", "--show-toplevel"),
    gitDescribe: git(cfg.repo, "describe", "--always", "--dirty"),
    engineSha: git(cfg.repo, "rev-parse", "HEAD"),
    harnessRepo: git(undefined, "rev-parse", "--show-toplevel"),
    harnessGitDescribe: git(undefined, "describe", "--always", "--dirty"),
    embeddingTextSupported: await embeddingTextSupported(admin),
    embedderModel: await embedderDigest(embedder.replace(/\+qprefix$/, "")),
    queryPrefix,
    seed: corpusSeed(cfg.corpusId),
    corpusHash: sha256File(cfg.corpusFile ?? (cfg.manifest && resolve(dirname(cfg.manifest), "corpus.json")),
      "no corpus file (no corpusFile, and no corpus.json next to the manifest)"),
    scenariosHash: sha256File(cfg.scenarios, "scenario file missing"),
    ...cfg.extraNotes,
  };

  const runId = await startRun({
    gitSha: git(cfg.repo, "rev-parse", "--short", "HEAD"),
    branch: git(cfg.repo, "rev-parse", "--abbrev-ref", "HEAD"),
    dataScale: cfg.dataScale ?? null,
    corpusId: cfg.corpusId,
    host: hostname(),
    notes: JSON.stringify(notes),
    embeddingText,
    embedder,
    textStrategy: cfg.textStrategy ?? "none",
    jobId: process.env.HARNESS_JOB_ID ?? null, // set by runner/src/queue.ts for the jobs it runs
  });
  console.log(`run ${runId}: ${adapters.length} engines × ${scenarios.length} scenarios × ${cfg.iterations} iterations`);
  await recordScenarios(runId, scenarios);

  const rows: QueryResultRow[] = [];
  const guard = cfg.semanticGuard;
  let guardChecked = 0;
  let liveNonEmpty = 0;
  let liveWithVector = 0;
  const guardViolations: string[] = [];
  // Scorer names seen per engine column (from `all-scores`); an engine that returns none (in-place) stays [].
  const scorers = new Map(adapters.map((a) => [cfg.engineLabels?.[a.id] ?? a.id, new Set<string>()]));
  for (const [n, scenario] of scenarios.entries()) {
    for (const adapter of adapters) {
      for (let w = 0; w < cfg.warmup; w++) await adapter.runQuery(scenario, { models: cfg.models, limit: cfg.limit });
    }
    const batch: QueryResultRow[] = [];
    for (let iteration = 0; iteration < cfg.iterations; iteration++) {
      for (const adapter of adapters) {
        const { outcome, latencyMs } = await timedCell(adapter, scenario, cfg);
        if (guard && guard.engines.includes(adapter.id) && !outcome.error) {
          guardChecked++;
          const v = guard.mode === "vector-only"
            ? vectorOnlyViolation(outcome.results, guard.pure)
            : fallbackViolation(outcome.results);
          if (v) guardViolations.push(`${adapter.id} ${scenario.id}#${iteration}: ${v}`);
          if (outcome.results.length) {
            liveNonEmpty++;
            const vectorHit = outcome.results.some((r) =>
              (r.allScores as { name?: string; score?: number }[]).some((s) => s.name === "semantic-distance" && (s.score ?? 0) > 0));
            if (vectorHit) liveWithVector++;
          }
        }
        for (const { allScores } of outcome.error ? [] : outcome.results) {
          for (const s of Array.isArray(allScores) ? allScores : []) {
            const name = (s as { name?: unknown } | null)?.name;
            if (typeof name === "string") scorers.get(cfg.engineLabels?.[adapter.id] ?? adapter.id)?.add(name);
          }
        }
        batch.push({
          engine: cfg.engineLabels?.[adapter.id] ?? adapter.id,
          embedder,
          dimensions,
          scenarioId: scenario.id,
          iteration,
          latencyMs,
          embedMs: null,
          storeMs: null,
          filterMs: null,
          resultCount: outcome.error ? null : outcome.results.length,
          rawCount: outcome.rawCount,
          returned: outcome.error ? null : outcome.results.map(({ model, id, name, score }) => ({ model, id, name, score })),
          error: outcome.error,
        });
      }
    }
    await recordQueryResults(runId, batch);
    rows.push(...batch);
    const errors = batch.filter((r) => r.error).length;
    console.log(`  [${n + 1}/${scenarios.length}] ${scenario.id}${errors ? `  (${errors} errored cells)` : ""}`);
  }

  // Rule 2a: the embedding-text variant must not change mid-run. A run that fails this is left unfinished
  // (finished_at NULL), which is what keeps it out of harness_valid_run and off the dashboard.
  const endVariant = await embeddingTextVariant(admin);
  if (endVariant !== embeddingText) {
    console.error(
      `embedding-text variant changed during the run (${embeddingText} → ${endVariant}); ` +
        `run ${runId} left unfinished, no metrics recorded`,
    );
    process.exitCode = 1;
    return { runId: null, rows };
  }
  if (!hasLabels(scenarios)) {
    console.log("scenarios carry no labels; skipping quality metrics (observations are recorded)");
  } else {
    const metricRows = toMetricRows(scenarios, rows, { k: 10 });
    await recordMetrics(runId, metricRows);
    console.log(`  ${metricRows.length} metric rows`);
  }

  // BL-34: a semantic column that silently fell back to appdb must never be published. Leave the run unfinished
  // (so harness_valid_run excludes it) when any response lacks the store's signature or the log shows the fallback.
  if (guard) {
    const logLines = storeErrorLines(guard.logPath, guard.failLogPatterns ?? []);
    const countedLogLines = Object.fromEntries(
      (guard.countLogPatterns ?? []).map((p) => [p, logLinesMatching(guard.logPath, [p]).length]));
    const liveVectorArm = { nonEmptyResponses: liveNonEmpty, withVectorHit: liveWithVector,
      share: liveNonEmpty ? Number((liveWithVector / liveNonEmpty).toFixed(3)) : null, required: guard.minLiveVectorShare ?? null };
    const verdict = { mode: guard.mode, pure: guard.pure, checkedResponses: guardChecked,
      violations: guardViolations.length, logErrorLines: logLines.length, liveVectorArm, countedLogLines };
    // With a requirement set, no non-empty response at all is as broken as a dead arm (share null).
    const deadArm = guard.minLiveVectorShare !== undefined
      && (liveVectorArm.share === null || liveVectorArm.share < guard.minLiveVectorShare);
    await updateRunNotes(runId, { fallbackGuard: verdict }).catch(() => {});
    if (deadArm) guardViolations.push(`live vector arm: only ${liveWithVector}/${liveNonEmpty} non-empty responses had a vector hit`);
    if (guardViolations.length || logLines.length) {
      console.error(`semantic fallback detected; run ${runId} left unfinished: ${JSON.stringify(verdict)}`);
      for (const v of guardViolations.slice(0, 5)) console.error(`  ${v}`);
      for (const l of logLines.slice(0, 3)) console.error(`  log: ${l.slice(0, 200)}`);
      process.exitCode = 1;
      return { runId: null, rows };
    }
    console.log(`  fallback guard: ${guardChecked} ${guard.mode} responses checked, 0 violations, 0 log errors`);
  }

  // Provenance is best-effort: a failed notes update must not leave the run unfinished.
  await updateRunNotes(runId, { scorers: Object.fromEntries([...scorers].map(([e, names]) => [e, [...names].sort()])) })
    .catch((e) => console.error(`warning: could not record scorer names in notes: ${e}`));
  await finishRun(runId);
  const failed = rows.filter((r) => r.error);
  console.log(`done: ${rows.length} observations, ${failed.length} errored${report.ok ? "" : " — NON-PUBLISHABLE (forced)"}`);
  return { runId, rows };
}

if (isMain(import.meta.url)) {
  try {
    await runMatrix(loadConfig(), { force: forceFlag() });
  } finally {
    await close();
  }
}
