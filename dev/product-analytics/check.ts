/**
 * Run each analysis's SQL against ClickHouse with a hand-written events_base
 * CTE (no Metabase) and check results against ground-truth.json.
 *
 * Usage: bun run dev/product-analytics/check.ts
 */

import { buildSql } from "../../frontend/src/metabase/product-analytics/build-sql";
import { defaultSpec } from "../../frontend/src/metabase/product-analytics/defaults";
import type { AnalysisKind } from "../../frontend/src/metabase/product-analytics/spec/types";

const CH = process.env.CLICKHOUSE_URL ?? "http://127.0.0.1:18123";

type GroundTruth = {
  start: string;
  end: string;
  funnel: { pricing: number; trial_started: number; checkout_completed: number };
  counts: Record<string, number>;
  inviteWeek1: number;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asNumber = (value: unknown, fallback = 0): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const parseTruth = (raw: unknown): GroundTruth => {
  if (!isRecord(raw) || !isRecord(raw.funnel) || !isRecord(raw.counts)) {
    throw new Error("ground-truth.json is missing funnel/counts");
  }
  if (typeof raw.start !== "string" || typeof raw.end !== "string") {
    throw new Error("ground-truth.json is missing start/end");
  }
  return {
    start: raw.start,
    end: raw.end,
    funnel: {
      pricing: asNumber(raw.funnel.pricing),
      trial_started: asNumber(raw.funnel.trial_started),
      checkout_completed: asNumber(raw.funnel.checkout_completed),
    },
    counts: Object.fromEntries(
      Object.entries(raw.counts).map(([key, value]) => [key, asNumber(value)]),
    ),
    inviteWeek1: asNumber(raw.inviteWeek1),
  };
};

const chDateTime = (iso: string): string =>
  iso.slice(0, 19).replace("T", " ");

async function chQuery(sql: string): Promise<string> {
  const res = await fetch(CH, { method: "POST", body: sql });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`ClickHouse ${res.status}: ${text.slice(0, 800)}`);
  }
  return text;
}

async function chJson(sql: string): Promise<Record<string, unknown>[]> {
  const text = await chQuery(`${sql.trim().replace(/;+\s*$/, "")} FORMAT JSON`);
  const parsed: unknown = JSON.parse(text);
  if (!isRecord(parsed) || !Array.isArray(parsed.data)) {
    throw new Error("Unexpected ClickHouse JSON");
  }
  return parsed.data.filter(isRecord);
}

const eventsBaseSql = (truth: GroundTruth): string => `
SELECT
  person_id,
  session_id,
  event_id,
  created_at,
  event_name,
  url_path,
  if(url_path = '/pricing', 1, 0) AS ev_1,
  if(event_name = 'trial_started', 1, 0) AS ev_2,
  if(event_name = 'checkout_completed', 1, 0) AS ev_3,
  if(event_name = 'signup', 1, 0) AS ev_4,
  if(startsWith(url_path, '/app') OR event_name IN ('report_created', 'invite_sent', 'checkout_completed'), 1, 0) AS ev_5,
  if(event_name = 'invite_sent', 1, 0) AS ev_6,
  if(event_name = 'error', 1, 0) AS ev_7,
  if(event_name = 'report_created', 1, 0) AS ev_8
FROM product_analytics.pa_events_resolved
WHERE created_at >= toDateTime('${chDateTime(truth.start)}')
  AND created_at < toDateTime('${chDateTime(truth.end)}')
`;

const relative = (actual: number, expected: number): number =>
  expected === 0 ? (actual === 0 ? 0 : Infinity) : Math.abs(actual - expected) / expected;

const failures: string[] = [];

const check = (name: string, ok: boolean, detail: string) => {
  if (ok) {
    console.log(`  ok  ${name} — ${detail}`);
  } else {
    console.log(`  FAIL ${name} — ${detail}`);
    failures.push(`${name}: ${detail}`);
  }
};

const run = async (kind: AnalysisKind, truth: GroundTruth) => {
  const built = buildSql(defaultSpec(kind), eventsBaseSql(truth));
  const rows = await chJson(built.sql);
  console.log(`\n${kind} (${rows.length} rows)`);

  if (kind === "funnel") {
    const byStep = new Map<number, number>();
    for (const row of rows) {
      byStep.set(asNumber(row.step), asNumber(row.people));
    }
    const step1 = byStep.get(1) ?? 0;
    const step2 = byStep.get(2) ?? 0;
    const step3 = byStep.get(3) ?? 0;
    check(
      "funnel step 1 ~ pricing viewers",
      relative(step1, truth.funnel.pricing) < 0.2 && step1 > 0,
      `got ${step1}, truth ${truth.funnel.pricing}`,
    );
    check("funnel is monotonic", step1 >= step2 && step2 >= step3, `${step1} ≥ ${step2} ≥ ${step3}`);
    check(
      "funnel has purchases",
      step3 > 0 && relative(step3, truth.funnel.checkout_completed) < 0.6,
      `got ${step3}, truth ${truth.funnel.checkout_completed}`,
    );
    return;
  }

  if (kind === "paths") {
    check("paths has edges", rows.length > 0, `${rows.length} edges`);
    return;
  }

  if (kind === "habit") {
    check("habit histogram has buckets", rows.length > 0, `${rows.length} buckets`);
    return;
  }

  if (kind === "lifecycle") {
    const states = new Set(rows.map((row) => String(row.state)));
    check(
      "lifecycle has the four states",
      ["new", "returning", "resurrected", "dormant"].every((s) => states.has(s)),
      [...states].join(", "),
    );
    return;
  }

  if (kind === "cohorts") {
    check("cohorts has cells", rows.length > 0, `${rows.length} cells`);
    const values = rows.map((row) => asNumber(row.value));
    check(
      "cohort values are in [0, 1]",
      values.every((value) => value >= 0 && value <= 1),
      `min ${Math.min(...values)} max ${Math.max(...values)}`,
    );
  }
};

const truthRaw: unknown = await Bun.file(
  `${import.meta.dir}/ground-truth.json`,
).json();
const truth = parseTruth(truthRaw);

const resolved = await chQuery(
  "EXISTS TABLE product_analytics.pa_events_resolved",
);
if (resolved.trim() !== "1") {
  throw new Error("pa_events_resolved is missing. Run 02_pa_events_resolved.sql.");
}

for (const kind of ["funnel", "paths", "habit", "lifecycle", "cohorts"] as const) {
  await run(kind, truth);
}

if (failures.length > 0) {
  console.error(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log("\nAll checks passed");
