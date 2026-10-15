/**
 * Run each analysis's SQL against ClickHouse with a hand-written events_base
 * CTE (no Metabase) and check results against ground-truth.json.
 *
 * Usage: bun run dev/product-analytics/check.ts
 */

import { buildSql } from "../../frontend/src/metabase/product-analytics/build-sql";
import type { ProjectedColumn } from "../../frontend/src/metabase/product-analytics/columns";
import type {
  AnalysisKind,
  AnalysisSpec,
  PathsSpec,
} from "../../frontend/src/metabase/product-analytics/spec/types";
import { hasCyclicFlow } from "../../frontend/src/metabase/visualizations/visualizations/SankeyChart/utils/cycle-detection";

import { FLAG, defaultSpec } from "./specs";

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

// ClickHouse's JSON output quotes 64-bit integers, so counts arrive as strings.
const asNumber = (value: unknown, fallback = 0): number => {
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed)
    ? parsed
    : fallback;
};

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
  country,
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

const cohortColumns = (spec: AnalysisSpec): ProjectedColumn[] =>
  spec.cohorts?.by === "attribute"
    ? [{ as: "cohort_attribute", alias: "country" }]
    : spec.cohorts !== undefined
      ? [{ as: "cohort_start", alias: "created_at" }]
      : [];

const run = async (
  kind: AnalysisKind,
  truth: GroundTruth,
  spec: AnalysisSpec = defaultSpec(kind),
  label: string = kind,
) => {
  const built = buildSql(spec, eventsBaseSql(truth), {
    columns: {
      timestamp: "created_at",
      person: "person_id",
      session: "session_id",
      event_id: "event_id",
      event_name: "event_name",
      url_path: "url_path",
    },
    flags: Object.values(FLAG),
    extraColumns: cohortColumns(spec),
  });
  const rows = await chJson(built.sql);
  console.log(`\n${label} (${rows.length} rows)`);

  if (kind === "funnel") {
    const byStep = new Map<number, number>();
    for (const row of rows) {
      // Labels are "<step>. <name>".
      byStep.set(parseInt(String(row.label), 10), asNumber(row.people));
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
    const edges = rows.map((row) => [String(row.source), String(row.target)]);
    check(
      "paths has no cycles",
      !hasCyclicFlow(edges, 0, 1),
      edges
        .slice(0, 3)
        .map(([source, target]) => `${source} → ${target}`)
        .join(", "),
    );
    const stepOf = (name: string) => Number(name.split(".")[0]);
    const sourceSteps = edges.map(([source]) => stepOf(source));
    const targetSteps = edges.map(([, target]) => stepOf(target));
    check(
      "paths edges go to the next step",
      edges.every(([source, target]) => stepOf(target) === stepOf(source) + 1),
      `steps ${Math.min(...sourceSteps)}–${Math.max(...targetSteps)}`,
    );
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
    const cohorts = new Set(rows.map((row) => String(row.cohort)));
    check(
      "cohorts has several rows",
      cohorts.size > 1,
      [...cohorts].slice(0, 4).join(", "),
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

// the generator puts signup and checkout in visits of their own, so "between"
// needs an ending event that shares a visit with pricing
const pathsSpec = defaultSpec("paths");
const pathsVariants: [string, Partial<PathsSpec>][] = [
  ["to checkout", { direction: "to" }],
  [
    "between pricing and report",
    { direction: "between", end: { flag: FLAG.report } },
  ],
];
for (const [label, overrides] of pathsVariants) {
  const paths: PathsSpec | undefined = pathsSpec.paths && {
    ...pathsSpec.paths,
    ...overrides,
  };
  await run("paths", truth, { ...pathsSpec, paths }, `paths (${label})`);
}

const cohortsSpec = defaultSpec("cohorts");
if (cohortsSpec.cohorts !== undefined) {
  await run(
    "cohorts",
    truth,
    {
      ...cohortsSpec,
      cohorts: { ...cohortsSpec.cohorts, by: "attribute" },
    },
    "cohorts (by country)",
  );
}

if (failures.length > 0) {
  console.error(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log("\nAll checks passed");
