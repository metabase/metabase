/**
 * Run each analysis's SQL against ClickHouse with a hand-written events_base
 * CTE (no Metabase) and check results against ground-truth.json.
 *
 * Usage: bun run dev/product-analytics/check.ts
 */

import {
  type BaseColumns,
  type BasePeopleSegments,
  buildSql,
} from "../../frontend/src/metabase/product-analytics/build-sql";
import type { ProjectedColumn } from "../../frontend/src/metabase/product-analytics/columns";
import type {
  AnalysisKind,
  AnalysisSpec,
  BreakoutSpec,
  FunnelSpec,
  PathsSpec,
} from "../../frontend/src/metabase/product-analytics/spec/types";
import { BREAKOUT_PROPERTY_COLUMN } from "../../frontend/src/metabase/product-analytics/sql/analyses/breakout";
import { activeColumn } from "../../frontend/src/metabase/product-analytics/sql/analyses/habit";
import { FIRST_SEEN_EXTRA_COLUMN } from "../../frontend/src/metabase/product-analytics/sql/analyses/lifecycle";
import {
  IN_RANGE_FLAG,
  getLookbackDays,
} from "../../frontend/src/metabase/product-analytics/sql/analyses/lookback";
import { hasCyclicFlow } from "../../frontend/src/metabase/visualizations/visualizations/SankeyChart/utils/cycle-detection";

import { FLAG, defaultSpec } from "./specs";

const CH = process.env.CLICKHOUSE_URL ?? "http://127.0.0.1:18123";

type GroundTruth = {
  start: string;
  end: string;
  funnel: {
    pricing: number;
    trial_started: number;
    checkout_completed: number;
  };
  counts: Record<string, number>;
  inviteWeek1: number;
  identifiedPeople: number;
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
    identifiedPeople: asNumber(raw.identifiedPeople),
  };
};

const chDateTime = (iso: string): string => iso.slice(0, 19).replace("T", " ");

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

/**
 * Every event in the data. `in_range` marks the events from `rangeStart` on,
 * for analyses that read history before the date range.
 */
const eventsBaseSql = (
  truth: GroundTruth,
  rangeStart = truth.start,
): string => `
SELECT
  if(created_at >= toDateTime('${chDateTime(rangeStart)}'), 1, 0) AS ${IN_RANGE_FLAG},
  person__first_seen_at,
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
  if(event_name = 'report_created', 1, 0) AS ev_8,
  if(event_name = 'integration_connected', 1, 0) AS ev_9
FROM product_analytics.pa_events_resolved
WHERE created_at >= toDateTime('${chDateTime(truth.start)}')
  AND created_at < toDateTime('${chDateTime(truth.end)}')
`;

const relative = (actual: number, expected: number): number =>
  expected === 0
    ? actual === 0
      ? 0
      : Infinity
    : Math.abs(actual - expected) / expected;

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
  spec.breakout?.type === "property"
    ? [{ as: BREAKOUT_PROPERTY_COLUMN, alias: "country" }]
    : [];

/**
 * The identities tables and their link to events: every identified person has
 * exactly one resolved identity row, and every identity row points at a
 * person who has events. This is the join Metabase's FK relies on. The
 * history keeps every identify(), and events carry traits only from then on.
 */
const checkIdentities = async (truth: GroundTruth) => {
  console.log("\nidentities");
  const [stats] = await chJson(`
    SELECT
      (SELECT count() FROM product_analytics.pa_identities) AS raw_rows,
      (SELECT count() FROM product_analytics.pa_identities_resolved) AS resolved_rows,
      (SELECT uniqExact(person_id) FROM product_analytics.pa_identities_resolved) AS resolved_people,
      (SELECT uniqExact(distinct_id) FROM product_analytics.pa_events_resolved WHERE distinct_id IS NOT NULL) AS identified_in_events,
      (SELECT count() FROM product_analytics.pa_identities_resolved AS i
        LEFT ANTI JOIN (SELECT DISTINCT person_id FROM product_analytics.pa_events_resolved) AS e
        ON e.person_id = i.person_id) AS orphan_identities,
      (SELECT count() FROM product_analytics.pa_identities_resolved WHERE email = '' OR plan = '') AS missing_traits,
      (SELECT count() FROM product_analytics.pa_identity_history) AS history_rows,
      (SELECT countIf(distinct_id IS NOT NULL AND person_role IS NULL) FROM product_analytics.pa_events_resolved) AS identified_without_traits,
      (SELECT countIf(distinct_id IS NULL AND person_role IS NOT NULL) FROM product_analytics.pa_events_resolved) AS anonymous_with_traits,
      (SELECT countIf(event_name = 'checkout_completed' AND person_billing_cycle IS NULL) FROM product_analytics.pa_events_resolved) AS checkouts_without_cycle,
      (SELECT countIf(event_name = 'trial_started' AND person_billing_cycle IS NOT NULL) FROM product_analytics.pa_events_resolved) AS trials_with_cycle,
      (SELECT countIf(person__identified != (person_role IS NOT NULL)) FROM product_analytics.pa_events_resolved) AS identified_mismatches
  `);
  const rawRows = asNumber(stats?.raw_rows);
  const resolvedRows = asNumber(stats?.resolved_rows);
  const resolvedPeople = asNumber(stats?.resolved_people);
  const identifiedInEvents = asNumber(stats?.identified_in_events);
  const orphans = asNumber(stats?.orphan_identities);
  const missingTraits = asNumber(stats?.missing_traits);
  const expectedRaw = truth.counts.identities ?? 0;

  // ClickHouse collapses ReplacingMergeTree duplicates inside one insert block
  // (optimize_on_insert) and in background merges, so the raw row count is
  // anywhere between people and identify() calls.
  check(
    "pa_identities holds between one row per person and one per identify()",
    resolvedPeople <= rawRows && rawRows <= expectedRaw,
    `got ${rawRows}, people ${resolvedPeople}, identify() calls ${expectedRaw}`,
  );
  check(
    "pa_identities_resolved has one row per person",
    resolvedRows === resolvedPeople && resolvedRows === truth.identifiedPeople,
    `rows ${resolvedRows}, people ${resolvedPeople}, truth ${truth.identifiedPeople}`,
  );
  check(
    "every identified person in events has an identity",
    identifiedInEvents === resolvedPeople,
    `events ${identifiedInEvents}, identities ${resolvedPeople}`,
  );
  check("no identity without events", orphans === 0, `${orphans} orphan rows`);
  check(
    "resolved traits are filled",
    missingTraits === 0,
    `${missingTraits} rows missing email or plan`,
  );

  const historyRows = asNumber(stats?.history_rows);
  const identifiedWithoutTraits = asNumber(stats?.identified_without_traits);
  const anonymousWithTraits = asNumber(stats?.anonymous_with_traits);
  const checkoutsWithoutCycle = asNumber(stats?.checkouts_without_cycle);
  const trialsWithCycle = asNumber(stats?.trials_with_cycle);
  const identifiedMismatches = asNumber(stats?.identified_mismatches);
  check(
    "pa_identity_history holds one row per identify()",
    historyRows === expectedRaw,
    `got ${historyRows}, identify() calls ${expectedRaw}`,
  );
  check(
    "identified events carry person traits",
    identifiedWithoutTraits === 0,
    `${identifiedWithoutTraits} events`,
  );
  check(
    "anonymous events carry no person traits",
    anonymousWithTraits === 0,
    `${anonymousWithTraits} events`,
  );
  check(
    "billing cycle is set from checkout on, not before",
    checkoutsWithoutCycle === 0 && trialsWithCycle === 0,
    `${checkoutsWithoutCycle} checkouts without, ${trialsWithCycle} trials with`,
  );
  // Every identify() here sends a role, so traits mark the identified events.
  check(
    "person__identified is true exactly from the first identify() on",
    identifiedMismatches === 0,
    `${identifiedMismatches} events`,
  );
};
const baseColumns = (spec: AnalysisSpec): BaseColumns => ({
  ...baseColumnsWithoutRange(spec),
  flags: [
    ...Object.values(FLAG),
    ...(getLookbackDays(spec) > 0 ? [IN_RANGE_FLAG] : []),
  ],
});

const baseColumnsWithoutRange = (spec: AnalysisSpec): BaseColumns => ({
  columns: {
    timestamp: "created_at",
    person: "person_id",
    session: "session_id",
    event_id: "event_id",
    event_name: "event_name",
    url_path: "url_path",
  },
  flags: Object.values(FLAG),
  extraColumns: [
    ...cohortColumns(spec),
    ...(spec.lifecycle?.hasFirstSeen
      ? [{ as: FIRST_SEEN_EXTRA_COLUMN, alias: "person__first_seen_at" }]
      : []),
  ],
});

const run = async (
  kind: AnalysisKind,
  truth: GroundTruth,
  spec: AnalysisSpec = defaultSpec(kind),
  label: string = kind,
) => {
  const built = buildSql(spec, eventsBaseSql(truth), baseColumns(spec));
  const rows = await chJson(built.sql);
  console.log(`\n${label} (${rows.length} rows)`);

  if (kind === "funnel") {
    // label is "1. Viewed pricing"
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
    check(
      "funnel is monotonic",
      step1 >= step2 && step2 >= step3,
      `${step1} ≥ ${step2} ≥ ${step3}`,
    );
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
    check(
      "habit histogram has buckets",
      rows.length > 0,
      `${rows.length} buckets`,
    );
    return;
  }

  if (kind === "lifecycle") {
    const states = new Set(rows.map((row) => String(row.state)));
    check(
      "lifecycle has the four states",
      ["new", "returning", "resurrected", "dormant"].every((s) =>
        states.has(s),
      ),
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
    if (spec.output.cohortsLines === "average") {
      const offsets = rows.map((row) => asNumber(row.offset));
      check(
        "average has a row per offset",
        new Set(offsets).size === rows.length,
        offsets.join(", "),
      );
    } else {
      const cohorts = new Set(rows.map((row) => String(row.cohort)));
      check(
        "cohorts has several rows",
        cohorts.size > 1,
        [...cohorts].slice(0, 4).join(", "),
      );
    }
  }
};

const truthRaw: unknown = await Bun.file(
  `${import.meta.dir}/ground-truth.json`,
).json();
const truth = parseTruth(truthRaw);

for (const [table, file] of [
  ["pa_events_resolved", "04_pa_events_resolved.sql"],
  ["pa_identities_resolved", "05_pa_identities_resolved.sql"],
]) {
  const exists = await chQuery(`EXISTS TABLE product_analytics.${table}`);
  if (exists.trim() !== "1") {
    throw new Error(`${table} is missing. Run ${file}.`);
  }
}

await checkIdentities(truth);

for (const kind of [
  "funnel",
  "paths",
  "habit",
  "lifecycle",
  "cohorts",
] as const) {
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

// A people segment's membership the way Metabase compiles it from the users
// table: its key and a 0/1 column per segment.
const PAID_PLANS = "('starter', 'pro', 'business')";
const paidSegment = (required: string[]): BasePeopleSegments => ({
  sql: `SELECT person_id, if(plan IN ${PAID_PLANS}, 1, 0) AS seg_1 FROM product_analytics.pa_identities_resolved`,
  primaryKey: "person_id",
  flags: ["seg_1"],
  required,
});
const paidBreakout = (withEveryone: boolean): BreakoutSpec => ({
  type: "segments",
  groups: [
    ...(withEveryone ? [{ label: "Everyone" }] : []),
    { label: "Paid", segment: { flag: "seg_1", isMember: true } },
    { label: "Not paid", segment: { flag: "seg_1", isMember: false } },
  ],
});

const cohortsSpec = defaultSpec("cohorts");
if (cohortsSpec.cohorts !== undefined) {
  const cohortsVariants: [string, AnalysisSpec][] = [
    ["by country", { ...cohortsSpec, breakout: { type: "property" } }],
    [
      "average, on or after",
      {
        ...cohortsSpec,
        cohorts: { ...cohortsSpec.cohorts, returnRule: "onOrAfter" },
        output: { ...cohortsSpec.output, cohortsLines: "average" },
      },
    ],
    [
      "from signup",
      {
        ...cohortsSpec,
        cohorts: { ...cohortsSpec.cohorts, start: { flag: FLAG.signup } },
      },
    ],
  ];
  for (const [label, spec] of cohortsVariants) {
    await run("cohorts", truth, spec, `cohorts (${label})`);
  }

  // Cohorts by a people segment: the segment's members plus the people
  // outside it are everyone, and the members are the people who match it in
  // the identities table.
  const segmentsSpec: AnalysisSpec = {
    ...cohortsSpec,
    breakout: paidBreakout(true),
  };
  const segmentSizes = async (required: string[]) => {
    const rows = await chJson(
      buildSql(segmentsSpec, eventsBaseSql(truth), {
        ...baseColumns(segmentsSpec),
        peopleSegments: paidSegment(required),
      }).sql,
    );
    const firstOffset = rows.filter((row) => asNumber(row.offset) === 0);
    return {
      order: firstOffset.map((row) => String(row.cohort)),
      sizes: new Map(
        firstOffset.map((row) => [
          String(row.cohort),
          asNumber(row.cohort_size),
        ]),
      ),
    };
  };
  const [direct] = await chJson(`
    WITH events AS (${eventsBaseSql(truth)})
    SELECT
      uniqExact(e.person_id) AS everyone,
      uniqExactIf(e.person_id, i.plan IN ${PAID_PLANS}) AS paid
    FROM events AS e
    LEFT JOIN product_analytics.pa_identities_resolved AS i
      ON i.person_id = e.person_id
  `);
  const everyone = asNumber(direct?.everyone);
  const paid = asNumber(direct?.paid);

  console.log("\ncohorts (by a people segment)");
  const bySegment = await segmentSizes([]);
  const sizeOf = (cohort: string) => bySegment.sizes.get(cohort) ?? 0;
  check(
    "segment cohorts keep their order",
    bySegment.order.join(", ") === "Everyone, Paid, Not paid",
    bySegment.order.join(", "),
  );
  check(
    "everyone is the segment's members plus the people outside it",
    sizeOf("Everyone") === everyone &&
      sizeOf("Paid") + sizeOf("Not paid") === everyone,
    `everyone ${sizeOf("Everyone")}, paid ${sizeOf("Paid")}, not paid ${sizeOf("Not paid")}, direct ${everyone}`,
  );
  check(
    "the segment's members match it in the identities table",
    sizeOf("Paid") === paid && paid > 0,
    `got ${sizeOf("Paid")}, direct ${paid}`,
  );

  console.log("\ncohorts (filtered to a people segment)");
  const filtered = await segmentSizes(["seg_1"]);
  check(
    "a people filter keeps only the segment's members",
    filtered.sizes.get("Everyone") === paid &&
      filtered.sizes.get("Paid") === paid &&
      !filtered.sizes.has("Not paid"),
    filtered.order
      .map((cohort) => `${cohort} ${filtered.sizes.get(cohort)}`)
      .join(", "),
  );
}

// Breakouts by a people segment, in every analysis. Paid and Not paid split
// everyone in two, so they add up to the analysis without a breakout, and
// Everyone, where there is one, is that analysis exactly.
type BreakoutCase = {
  label: string;
  spec: AnalysisSpec;
  /** The columns that name a row, besides the group. */
  keys: string[];
  metric: string;
  withEveryone: boolean;
};

const withView = (
  spec: AnalysisSpec,
  output: AnalysisSpec["output"],
): AnalysisSpec => ({ ...spec, output: { ...spec.output, ...output } });

const habitRatioSpec = defaultSpec("habit");
const breakoutCases: BreakoutCase[] = [
  {
    label: "funnel steps",
    spec: defaultSpec("funnel"),
    keys: ["label"],
    metric: "people",
    withEveryone: true,
  },
  {
    label: "funnel time to finish",
    spec: withView(defaultSpec("funnel"), { funnelView: "timeToConvert" }),
    keys: ["time_to_convert"],
    metric: "people",
    withEveryone: true,
  },
  {
    label: "habit",
    spec: defaultSpec("habit"),
    keys: ["periods"],
    metric: "people",
    withEveryone: true,
  },
  {
    label: "habit DAU",
    spec: {
      ...habitRatioSpec,
      habit: habitRatioSpec.habit && {
        ...habitRatioSpec.habit,
        measure: "ratio",
      },
    },
    keys: ["day"],
    metric: "dau",
    withEveryone: true,
  },
  {
    label: "lifecycle",
    spec: defaultSpec("lifecycle"),
    keys: ["period", "state"],
    metric: "actors",
    withEveryone: true,
  },
  {
    label: "paths",
    spec: defaultSpec("paths"),
    keys: ["source", "target"],
    metric: "weight",
    withEveryone: false,
  },
];

const sumByKey = (
  rows: Record<string, unknown>[],
  { keys, metric }: Pick<BreakoutCase, "keys" | "metric">,
): Map<string, number> => {
  const sums = new Map<string, number>();
  for (const row of rows) {
    const key = keys.map((name) => String(row[name])).join(" / ");
    sums.set(key, (sums.get(key) ?? 0) + asNumber(row[metric]));
  }
  return sums;
};

const diffSums = (
  actual: Map<string, number>,
  expected: Map<string, number>,
): string[] =>
  [...new Set([...actual.keys(), ...expected.keys()])]
    .filter((key) => (actual.get(key) ?? 0) !== (expected.get(key) ?? 0))
    .map(
      (key) => `${key}: ${actual.get(key) ?? 0} vs ${expected.get(key) ?? 0}`,
    );

for (const breakoutCase of breakoutCases) {
  const { label, spec, withEveryone } = breakoutCase;
  console.log(`\n${label} (by a people segment)`);
  const plain = await chJson(
    buildSql(spec, eventsBaseSql(truth), baseColumns(spec)).sql,
  );
  const brokenOutSpec: AnalysisSpec = {
    ...spec,
    breakout: paidBreakout(withEveryone),
  };
  const brokenOut = await chJson(
    buildSql(brokenOutSpec, eventsBaseSql(truth), {
      ...baseColumns(brokenOutSpec),
      peopleSegments: paidSegment([]),
    }).sql,
  );
  const inGroup = (group: string) =>
    sumByKey(
      brokenOut.filter((row) => row.breakout === group),
      breakoutCase,
    );
  const expected = sumByKey(plain, breakoutCase);
  const split = sumByKey(
    brokenOut.filter((row) => row.breakout !== "Everyone"),
    breakoutCase,
  );
  const splitDiffs = diffSums(split, expected);
  check(
    "Paid and Not paid add up to the analysis without a breakout",
    splitDiffs.length === 0 && inGroup("Paid").size > 0,
    splitDiffs.slice(0, 3).join(", ") || `${expected.size} rows`,
  );
  if (withEveryone) {
    const everyoneDiffs = diffSums(inGroup("Everyone"), expected);
    check(
      "Everyone is the analysis without a breakout",
      everyoneDiffs.length === 0,
      everyoneDiffs.slice(0, 3).join(", ") || `${expected.size} rows`,
    );
  }
}

// Shares instead of counts: a habit group's shares add up to 100%.
const sharesSum = (
  rows: Record<string, unknown>[],
  keys: string[],
  include: (row: Record<string, unknown>) => boolean,
  metric: string,
): number[] =>
  [
    ...sumByKey(rows.filter(include), { keys, metric }).values(),
  ].map((sum) => Math.round(sum * 100) / 100);

const percentSpec = (spec: AnalysisSpec): AnalysisSpec => ({
  ...spec,
  breakout: paidBreakout(true),
});
const percentColumns = (spec: AnalysisSpec) => ({
  ...baseColumns(spec),
  peopleSegments: paidSegment([]),
});

console.log("\nhabit as a share of each group");
const habitDefault = defaultSpec("habit");
const habitPercent = percentSpec({
  ...habitDefault,
  habit: habitDefault.habit && { ...habitDefault.habit, percent: true },
});
const habitShares = sharesSum(
  await chJson(
    buildSql(habitPercent, eventsBaseSql(truth), percentColumns(habitPercent))
      .sql,
  ),
  ["breakout"],
  () => true,
  "people",
);
check(
  "each group's shares add up to 100%",
  habitShares.length === 3 && habitShares.every((sum) => sum === 1),
  habitShares.join(", "),
);

// DAU/MAU and WAU/MAU: the range starts 40 days into the data, so the month
// before its first period comes from the lookback. Check the first period
// against counting it directly.
const ratioStart = new Date(
  new Date(truth.start).getTime() + 40 * 24 * 60 * 60 * 1000,
).toISOString();
const ratioEventsBase = eventsBaseSql(truth, ratioStart);
const habitSpec = defaultSpec("habit");
for (const subPeriod of ["day", "week"] as const) {
  const spec: AnalysisSpec = {
    ...habitSpec,
    habit: habitSpec.habit && {
      ...habitSpec.habit,
      subPeriod,
      measure: "ratio",
    },
  };
  const active = activeColumn(subPeriod);
  const rows = await chJson(
    buildSql(spec, ratioEventsBase, baseColumns(spec)).sql,
  );
  console.log(`
habit ratio by ${subPeriod} (${rows.length} rows)`);
  const periodStart =
    subPeriod === "day"
      ? `toStartOfDay(toDateTime('${chDateTime(ratioStart)}'))`
      : `toStartOfWeek(toDateTime('${chDateTime(ratioStart)}'), 1)`;
  const periodEnd = `${periodStart} + INTERVAL 1 ${subPeriod.toUpperCase()}`;
  const monthStart =
    subPeriod === "day"
      ? `${periodStart} - INTERVAL 29 DAY`
      : `${periodStart} - INTERVAL 3 WEEK`;
  const [direct] = await chJson(`
    WITH events AS (${ratioEventsBase})
    SELECT
      toString(${periodStart}) AS period,
      uniqExactIf(person_id, ${IN_RANGE_FLAG} = 1 AND created_at < ${periodEnd}) AS active,
      uniqExactIf(person_id, created_at >= ${monthStart} AND created_at < ${periodEnd}) AS mau
    FROM events
    WHERE ${FLAG.active} = 1 AND created_at >= ${monthStart} AND created_at < ${periodEnd}
  `);
  const [first] = rows;
  check(
    `the first ${subPeriod} is the range's`,
    String(first?.[subPeriod]) === String(direct?.period),
    `got ${String(first?.[subPeriod])}, expected ${String(direct?.period)}`,
  );
  check(
    `the first ${subPeriod}'s ${active} and MAU match counting them directly`,
    asNumber(first?.[active]) === asNumber(direct?.active) &&
      asNumber(first?.mau) === asNumber(direct?.mau),
    `${active} ${asNumber(first?.[active])} vs ${asNumber(direct?.active)}, ` +
      `mau ${asNumber(first?.mau)} vs ${asNumber(direct?.mau)}`,
  );
  const ratios = rows.map((row) => asNumber(row.ratio));
  check(
    `${active}/MAU is in (0, 1) and not always 1`,
    ratios.every((ratio) => ratio > 0 && ratio <= 1) &&
      ratios.some((ratio) => ratio < 1),
    `min ${Math.min(...ratios)} max ${Math.max(...ratios)}`,
  );
}

// Lifecycle: the range starts 40 days into the data, so its first week has
// people from before it. New means first seen that week, and returning means
// active the week before too, which only the lookback can see.
const lifecycleStart = ratioStart;
const lifecycleSpec = defaultSpec("lifecycle");
const lifecycleRows = await chJson(
  buildSql(
    lifecycleSpec,
    eventsBaseSql(truth, lifecycleStart),
    baseColumns(lifecycleSpec),
  ).sql,
);
console.log(`\nlifecycle from ${lifecycleStart.slice(0, 10)}`);
const firstWeek = `toStartOfWeek(toDateTime('${chDateTime(lifecycleStart)}'), 1)`;
const [lifecycleDirect] = await chJson(`
  WITH events AS (${eventsBaseSql(truth, lifecycleStart)}),
  weeks AS (
    SELECT
      person_id,
      toStartOfWeek(min(person__first_seen_at), 1) AS first_seen_week,
      countIf(toStartOfWeek(created_at, 1) = ${firstWeek} AND ${IN_RANGE_FLAG} = 1) > 0 AS active_now,
      countIf(toStartOfWeek(created_at, 1) = ${firstWeek} - INTERVAL 1 WEEK) > 0 AS active_before
    FROM events
    WHERE ${FLAG.active} = 1
    GROUP BY person_id
  )
  SELECT
    toString(${firstWeek}) AS week,
    countIf(active_now AND first_seen_week = ${firstWeek}) AS new,
    countIf(active_now AND active_before) AS returning
  FROM weeks
`);
const lifecycleAt = (state: string) =>
  asNumber(
    lifecycleRows.find(
      (row) =>
        String(row.period) === String(lifecycleDirect?.week) &&
        row.state === state,
    )?.actors,
  );
check(
  "lifecycle starts at the range's first week",
  String(lifecycleRows[0]?.period) === String(lifecycleDirect?.week),
  `got ${String(lifecycleRows[0]?.period)}, expected ${String(lifecycleDirect?.week)}`,
);
check(
  "new in the first week are the people first seen that week",
  lifecycleAt("new") === asNumber(lifecycleDirect?.new),
  `got ${lifecycleAt("new")}, expected ${asNumber(lifecycleDirect?.new)}`,
);
check(
  "returning in the first week were active the week before",
  lifecycleAt("returning") === asNumber(lifecycleDirect?.returning),
  `got ${lifecycleAt("returning")}, expected ${asNumber(lifecycleDirect?.returning)}`,
);

// Funnel timing, on hand-written events: durations come from the run the
// funnel counted, not from each step's first time ever.
type FixtureEvent = {
  actor: string;
  flag: (typeof FLAG)[keyof typeof FLAG];
  at: string;
};

const fixtureEventsSql = (events: FixtureEvent[]): string =>
  events
    .map(
      ({ actor, flag, at }, index) =>
        `SELECT '${actor}' AS person_id, toDateTime('${at}') AS created_at, ` +
        `'s' AS session_id, 'e${index}' AS event_id, 'event' AS event_name, '/' AS url_path, ` +
        Object.values(FLAG)
          .map((other) => `${Number(other === flag)} AS ${other}`)
          .join(", "),
    )
    .join("\nUNION ALL\n");

const funnelFixtureRows = (
  events: FixtureEvent[],
  funnelOverrides: Partial<FunnelSpec>,
  funnelView: NonNullable<AnalysisSpec["output"]["funnelView"]>,
) => {
  const spec = defaultSpec("funnel");
  const fixtureSpec: AnalysisSpec = {
    ...spec,
    funnel: spec.funnel && {
      ...spec.funnel,
      window: { value: 7, unit: "day" },
      ...funnelOverrides,
    },
    output: { funnelView },
  };
  return chJson(
    buildSql(fixtureSpec, fixtureEventsSql(events), baseColumns(fixtureSpec))
      .sql,
  );
};

// Each expected value's key, from the row, as a number when the expected one is.
const checkRows = (
  name: string,
  rows: Record<string, unknown>[],
  expected: Record<string, string | number | null>[],
) => {
  const actual = rows.map((row, index) =>
    Object.fromEntries(
      Object.entries(expected[index] ?? row).map(([key, value]) => [
        key,
        typeof value === "number" ? asNumber(row[key], NaN) : row[key],
      ]),
    ),
  );
  check(
    name,
    JSON.stringify(actual) === JSON.stringify(expected),
    JSON.stringify(actual),
  );
};

const HOUR_SECONDS = 3600;
const DAY_SECONDS = 24 * HOUR_SECONDS;

// Viewed pricing and went no further, came back 10 days later, and finished 2
// days after that. In a 7 day window, only the second run finishes.
const RETURNING: FixtureEvent[] = [
  { actor: "returning", flag: FLAG.pricing, at: "2026-01-01 00:00:00" },
  { actor: "returning", flag: FLAG.pricing, at: "2026-01-11 00:00:00" },
  { actor: "returning", flag: FLAG.trial, at: "2026-01-11 01:00:00" },
  { actor: "returning", flag: FLAG.checkout, at: "2026-01-13 00:00:00" },
];
// Started a trial a day after viewing pricing, again 9 days later, and
// purchased a day after that.
const RETRYING: FixtureEvent[] = [
  { actor: "retrying", flag: FLAG.pricing, at: "2026-01-01 00:00:00" },
  { actor: "retrying", flag: FLAG.trial, at: "2026-01-02 00:00:00" },
  { actor: "retrying", flag: FLAG.trial, at: "2026-01-11 00:00:00" },
  { actor: "retrying", flag: FLAG.checkout, at: "2026-01-12 00:00:00" },
];
// Viewed pricing twice, started a trial an hour after the second view, and
// purchased 2 days later.
const REVIEWING: FixtureEvent[] = [
  { actor: "reviewing", flag: FLAG.pricing, at: "2026-01-01 00:00:00" },
  { actor: "reviewing", flag: FLAG.pricing, at: "2026-01-03 00:00:00" },
  { actor: "reviewing", flag: FLAG.trial, at: "2026-01-03 01:00:00" },
  { actor: "reviewing", flag: FLAG.checkout, at: "2026-01-05 00:00:00" },
];
// From the fastest anyone took to the end of the window, with no one past it.
const TOOK_TWO_DAYS = [
  { time_to_convert: "2d–3d", people: 1 },
  { time_to_convert: "3d–5d", people: 0 },
  { time_to_convert: "5d–7d", people: 0 },
];

console.log("\nfunnel timing");
for (const ordering of ["loose", "strict"] as const) {
  checkRows(
    `a ${ordering} funnel is timed from the run that finished, not the first step ever`,
    await funnelFixtureRows(RETURNING, { ordering }, "timeToConvert"),
    TOOK_TWO_DAYS,
  );
}
checkRows(
  "each step is timed from the previous one in the same run",
  await funnelFixtureRows(RETURNING, {}, "steps"),
  [
    { people: 1, median_seconds_from_previous: null },
    { people: 1, median_seconds_from_previous: HOUR_SECONDS },
    { people: 1, median_seconds_from_previous: 2 * DAY_SECONDS - HOUR_SECONDS },
  ],
);
const [returningWeek] = await chJson(
  `SELECT toString(toStartOfInterval(toDateTime('2026-01-11 00:00:00'), INTERVAL 1 WEEK)) AS period`,
);
checkRows(
  "a run is in the period it started",
  await funnelFixtureRows(RETURNING, {}, "overTime"),
  [
    { period: String(returningWeek?.period), conversion: 1 },
    { period: String(returningWeek?.period), conversion: 1 },
  ],
);
checkRows(
  "counted from each step, a step done again goes on from its latest time",
  await funnelFixtureRows(RETRYING, { anchor: "each" }, "steps"),
  [
    { people: 1, median_seconds_from_previous: null },
    { people: 1, median_seconds_from_previous: DAY_SECONDS },
    { people: 1, median_seconds_from_previous: DAY_SECONDS },
  ],
);
checkRows(
  "counted from each step, a run can take longer than the window",
  await funnelFixtureRows(RETRYING, { anchor: "each" }, "timeToConvert"),
  [{ time_to_convert: "7d+", people: 1 }],
);
checkRows(
  "counted from each step, a run starts at the last first step before going on",
  await funnelFixtureRows(REVIEWING, { anchor: "each" }, "timeToConvert"),
  TOOK_TWO_DAYS,
);

if (failures.length > 0) {
  console.error(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log("\nAll checks passed");
