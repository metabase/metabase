#!/usr/bin/env bun
//
// Entrypoint for the drivers-rollup workflow (.github/workflows/drivers-rollup.yml).
//
// Triggered on every `check_run` create/complete for a driver check, it:
//   1. pulls the ci-test-config drivers config,
//   2. lists all check-runs on the commit (overlaid with the triggering event),
//   3. computes the aggregate state (see rollup.ts),
//   4. upserts the single `drivers-tests-result` check-run with detailed debug
//      info in its output.
//
// Run with: bun .github/scripts/drivers-rollup/index.ts

import { type ConfigEntry, parseDriversConfig } from "./config";
import { type GitHubCheckRun, listCheckRunsForRef, upsertCheckRun } from "./github";
import { computeRollup } from "./rollup";

const SELF_NAME = "drivers-tests-result";
const DEFAULT_CONFIG_URL =
  "https://raw.githubusercontent.com/metabase/ci-test-config/refs/heads/master/ci-test-config.json";

const log = (msg: string) => console.log(`[drivers-rollup] ${msg}`);

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`missing required env ${name}`);
  }
  return value;
}

async function fetchConfig(url: string): Promise<ConfigEntry[]> {
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      log(`config HTTP ${res.status}; treating every driver as required`);
      return [];
    }
    return parseDriversConfig(await res.json());
  } catch (error) {
    log(`config fetch failed (${error instanceof Error ? error.message : error}); treating every driver as required`);
    return [];
  }
}

/**
 * The check-runs API is eventually consistent, so the run that just fired the
 * event may be missing/stale in the list. Overlay the event's own check so the
 * rollup always reflects the latest known state.
 */
function overlayTriggeringCheck(runs: GitHubCheckRun[]): GitHubCheckRun[] {
  const name = process.env.CHECK_NAME;
  if (!name) {
    return runs;
  }
  const status = process.env.CHECK_STATUS ?? "completed";
  const conclusion = process.env.CHECK_CONCLUSION || null;
  const existing = runs.find((r) => r.name === name);
  if (existing) {
    existing.status = status;
    existing.conclusion = conclusion;
    return runs;
  }
  return [...runs, { id: -1, name, status, conclusion }];
}

function buildOutputText(considered: ReturnType<typeof computeRollup>["considered"]): string {
  const rows = considered
    // Show the gating (required) checks first, then the rest.
    .slice()
    .sort((a, b) => Number(b.configStatus === "required") - Number(a.configStatus === "required"))
    .map(
      (c) =>
        `| \`${c.leaf}\` | ${c.configStatus} | ${c.runStatus} | ${c.conclusion ?? "—"} | ${c.verdict} |`,
    );
  return [
    "| check | config | run status | conclusion | verdict |",
    "| --- | --- | --- | --- | --- |",
    ...rows,
  ].join("\n");
}

async function main(): Promise<void> {
  const token = requireEnv("GITHUB_TOKEN");
  const [owner, repo] = requireEnv("GITHUB_REPOSITORY").split("/");
  if (!owner || !repo) {
    throw new Error(`malformed GITHUB_REPOSITORY: ${process.env.GITHUB_REPOSITORY}`);
  }
  const headSha = requireEnv("HEAD_SHA");
  const configUrl = process.env.CONFIG_URL || DEFAULT_CONFIG_URL;

  log(`event check='${process.env.CHECK_NAME ?? ""}' status='${process.env.CHECK_STATUS ?? ""}' conclusion='${process.env.CHECK_CONCLUSION ?? ""}'`);
  log(`commit ${headSha}`);

  const config = await fetchConfig(configUrl);
  log(`config: ${config.length} non-default driver entr(ies)`);

  const ghRuns = overlayTriggeringCheck(await listCheckRunsForRef(owner, repo, headSha, token));
  const result = computeRollup(ghRuns, config, { selfName: SELF_NAME });

  log(
    `=> ${result.state}${result.conclusion ? `/${result.conclusion}` : ""} ` +
      `(required: ${result.counts.passing} pass, ${result.counts.pending} pending, ${result.counts.failing} fail; ` +
      `${result.counts.info} info, ${result.counts.skip} skip ignored)`,
  );
  for (const c of result.considered) {
    log(`  ${c.verdict.padEnd(7)} ${c.configStatus.padEnd(8)} ${c.runStatus.padEnd(12)} ${c.conclusion ?? "—"}  ${c.leaf}`);
  }

  const summary = [
    `**${result.title}**`,
    "",
    `Triggered by \`${process.env.CHECK_NAME ?? "?"}\` (${process.env.CHECK_STATUS ?? "?"}${process.env.CHECK_CONCLUSION ? `/${process.env.CHECK_CONCLUSION}` : ""}).`,
    "",
    `- required: **${result.counts.passing}** passed, **${result.counts.pending}** pending, **${result.counts.failing}** failed`,
    `- ignored: **${result.counts.info}** info, **${result.counts.skip}** skip`,
    `- config: ${config.length} non-default entr(ies) from ci-test-config`,
  ].join("\n");

  const existing = ghRuns.find((r) => r.name === SELF_NAME && r.id > 0);
  const upserted = await upsertCheckRun(
    owner,
    repo,
    {
      name: SELF_NAME,
      headSha,
      status: result.state,
      conclusion: result.conclusion,
      output: { title: result.title, summary, text: buildOutputText(result.considered) },
      existingId: existing?.id,
    },
    token,
  );
  log(`${existing ? "updated" : "created"} check-run ${SELF_NAME} (#${upserted.id})`);
}

main().catch((error) => {
  console.error(`[drivers-rollup] FATAL: ${error instanceof Error ? error.stack : error}`);
  process.exit(1);
});
