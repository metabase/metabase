/**
 * Run the funnel insight search against ClickHouse with a hand-written
 * events_base (no Metabase), and check it finds what generate.ts planted.
 *
 * Not the app's defaults: this covers all the data with a 30-day window, where
 * the app shows the last 90 days with a 7-day window. Most journeys here take
 * longer than 7 days, so with the app's defaults the funnel is too small to
 * find the iOS and Android + Firefox effects. See insights.plan.md.
 *
 * Usage: bun run dev/product-analytics/check-insights.ts
 */

import _ from "underscore";

import { buildSql } from "../../frontend/src/metabase/product-analytics/build-sql";
import { IDENTIFIED_COLUMN } from "../../frontend/src/metabase/product-analytics/columns";
import { indexCounts } from "../../frontend/src/metabase/product-analytics/insights/counts";
import { DEFAULT_INSIGHT_OPTIONS } from "../../frontend/src/metabase/product-analytics/insights/options";
import { planPairs } from "../../frontend/src/metabase/product-analytics/insights/plan-pairs";
import {
  parseCountRows,
  parseQuestionLabels,
} from "../../frontend/src/metabase/product-analytics/insights/rows";
import { findInsights } from "../../frontend/src/metabase/product-analytics/insights/search";
import {
  getExpectedRate,
  getInsightSegments,
  getMinSegmentSize,
  isDescending,
} from "../../frontend/src/metabase/product-analytics/insights/segments";
import type {
  GroupCounts,
  Insight,
} from "../../frontend/src/metabase/product-analytics/insights/types";
import type {
  AnalysisSpec,
  HabitSpec,
} from "../../frontend/src/metabase/product-analytics/spec/types";
import type { EventCountAttribute } from "../../frontend/src/metabase/product-analytics/sql/analyses/event-activity";
import { funnelInsightPopulation } from "../../frontend/src/metabase/product-analytics/sql/analyses/funnel-insights";
import {
  HABIT_INSIGHT_QUESTIONS,
  habitInsightPopulation,
} from "../../frontend/src/metabase/product-analytics/sql/analyses/habit-insights";
import {
  type AttributeAsOf,
  type InsightPopulation,
  type InsightsQuery,
  planInsights,
} from "../../frontend/src/metabase/product-analytics/sql/analyses/insights";
import { FIRST_SEEN_EXTRA_COLUMN } from "../../frontend/src/metabase/product-analytics/sql/analyses/lifecycle";
import { lifecycleInsightPopulation } from "../../frontend/src/metabase/product-analytics/sql/analyses/lifecycle-insights";
import { IN_RANGE_FLAG } from "../../frontend/src/metabase/product-analytics/sql/analyses/lookback";

import { FLAG, defaultSpec } from "./specs";

const CH = process.env.CLICKHOUSE_URL ?? "http://127.0.0.1:18123";
const TABLE = "product_analytics.pa_events_resolved";
const ROLE_COLUMNS = new Set([
  "person_id",
  "session_id",
  "visit_id",
  "event_id",
  "event_name",
  "url_path",
  "created_at",
  "distinct_id",
  "visitor_id",
]);
const MAX_DISTINCT = 200;

const STEPS = ["Viewed pricing", "Started trial", "Purchased"];

type Planted = {
  expected: {
    transition: string;
    conditions: Record<string, string>[];
    direction: "higher" | "lower";
    why: string;
  }[];
  unexpected: {
    transition: string;
    column: string;
    value?: string;
    why: string;
  }[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

async function chQuery(sql: string): Promise<unknown> {
  const res = await fetch(CH, {
    method: "POST",
    body: `${sql} FORMAT JSONCompact`,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`ClickHouse ${res.status}: ${text.slice(0, 800)}`);
  }
  return JSON.parse(text);
}

async function chRows(
  sql: string,
): Promise<{ names: string[]; rows: unknown[][] }> {
  const parsed = await chQuery(sql);
  if (
    !isRecord(parsed) ||
    !Array.isArray(parsed.meta) ||
    !Array.isArray(parsed.data)
  ) {
    throw new Error("Unexpected ClickHouse JSON");
  }
  return {
    names: parsed.meta.map((column) =>
      isRecord(column) ? String(column.name) : "",
    ),
    rows: parsed.data.filter((row): row is unknown[] => Array.isArray(row)),
  };
}

/**
 * String and boolean columns with 2–200 distinct values, like the app's
 * candidates. Empty counts as a value, as in Metabase's fingerprint, so a
 * column that's only ever true or empty qualifies. Whether the person was
 * identified comes first, as in the app.
 */
async function candidateColumns(): Promise<string[]> {
  const { rows } = await chRows(
    `SELECT name FROM system.columns
     WHERE database = 'product_analytics' AND table = 'pa_events_resolved'
       AND (type LIKE '%String%' OR type LIKE '%Bool%') AND type NOT LIKE 'Map%'`,
  );
  const names = rows
    .map(([name]) => String(name))
    .filter((name) => !ROLE_COLUMNS.has(name));
  const { rows: distinct } = await chRows(
    `SELECT ${names.map((name) => `uniqExact(ifNull(toString(${name}), ''))`).join(", ")} FROM ${TABLE}`,
  );
  const candidates = names.filter((_name, index) => {
    const count = Number(distinct[0]?.[index]);
    return count >= 2 && count <= MAX_DISTINCT;
  });
  return _.sortBy(candidates, (name) => (name === IDENTIFIED_COLUMN ? 0 : 1));
}

const loadPlanted = async (): Promise<Planted> => {
  const truth: unknown = await Bun.file(
    `${import.meta.dir}/ground-truth.json`,
  ).json();
  if (!isRecord(truth) || !isRecord(truth.insights)) {
    throw new Error("ground-truth.json has no insights; re-run generate.ts");
  }
  // Written by generate.ts from its own PlantedInsights constant.
  return truth.insights as Planted;
};

const main = async () => {
  const columns = await candidateColumns();
  const ids = columns.map((_column, index) => `attr_${index + 1}`);
  const columnOf = new Map(ids.map((id, index) => [id, columns[index]]));
  const asOf = new Map<string, AttributeAsOf>(
    ids.map((id, index) => [
      id,
      columns[index] === IDENTIFIED_COLUMN ? "true-by-step" : "first-seen",
    ]),
  );
  const spec = defaultSpec("funnel");
  const baseSql = `SELECT person_id, session_id, event_id, created_at, event_name, url_path, ${columns.join(", ")},
  if(url_path = '/pricing', 1, 0) AS ev_1,
  if(event_name = 'trial_started', 1, 0) AS ev_2,
  if(event_name = 'checkout_completed', 1, 0) AS ev_3
FROM ${TABLE}`;

  const population = funnelInsightPopulation(spec, ids, asOf);
  if (population === undefined) {
    throw new Error("The funnel needs at least two steps.");
  }
  const toSql = (query: InsightsQuery): string =>
    buildSql(
      spec,
      baseSql,
      {
        columns: {
          timestamp: "created_at",
          person: "person_id",
          session: "session_id",
          event_id: "event_id",
          event_name: "event_name",
          url_path: "url_path",
        },
        flags: [FLAG.pricing, FLAG.trial, FLAG.checkout],
        extraColumns: ids.map((id, index) => ({
          as: id,
          alias: columns[index],
        })),
      },
      planInsights(population, query),
    ).sql;
  const run = async (query: InsightsQuery): Promise<GroupCounts[]> => {
    const started = performance.now();
    const { names, rows } = await chRows(toSql(query));
    console.log(
      `  ${query.kind}: ${rows.length} rows in ${Math.round(performance.now() - started)}ms`,
    );
    return parseCountRows(names, rows, ids);
  };

  console.log(`Candidate columns: ${columns.join(", ")}`);
  const singles = await run({ kind: "singles", attributes: ids });
  const kept = planPairs(
    indexCounts({ rows: singles, singleAttributes: ids }),
    ids,
  );
  console.log(
    `  pairs over: ${[...kept].map(([id, values]) => `${columnOf.get(id)} (${values.length})`).join(", ")}`,
  );
  const pairs = kept.size > 0 ? await run({ kind: "pairs", kept }) : [];
  const counts = indexCounts({
    rows: [...singles, ...pairs],
    singleAttributes: ids,
    pairValues: kept,
  });
  const insights = findInsights(counts);

  const transitionName = (transition: number) =>
    `${STEPS[transition - 1]} → ${STEPS[transition]}`;
  const describe = (insight: Insight) =>
    insight.conditions
      .map(
        ({ attributeId, value }) => `${columnOf.get(attributeId)} = ${value}`,
      )
      .join(" and ");

  console.log(
    `\nInsights (q = ${DEFAULT_INSIGHT_OPTIONS.falseDiscoveryRate}):`,
  );
  insights.forEach((insight) =>
    console.log(
      `  ${transitionName(insight.question)} | ${describe(insight)} | ` +
        `${(insight.rate * 100).toFixed(1)}% vs ${(insight.restRate * 100).toFixed(1)}% | ` +
        `${insight.reached} people | excess ${insight.excess.toFixed(0)} | p ${insight.pValue.toExponential(1)}`,
    ),
  );

  const planted = await loadPlanted();
  const failures: string[] = [];
  const conditionsOf = (insight: Insight) =>
    Object.fromEntries(
      insight.conditions.map(({ attributeId, value }) => [
        columnOf.get(attributeId),
        value,
      ]),
    );

  console.log("\nPlanted:");
  planted.expected.forEach((expected) => {
    const found = insights.find(
      (insight) =>
        transitionName(insight.question) === expected.transition &&
        expected.conditions.some((conditions) =>
          Bun.deepEquals(conditionsOf(insight), conditions),
        ) &&
        (insight.excess > 0 ? "higher" : "lower") === expected.direction,
    );
    const label = `${expected.transition} | ${JSON.stringify(expected.conditions)} ${expected.direction}`;
    console.log(`  ${found ? "ok  " : "FAIL"} found ${label}`);
    if (!found) {
      failures.push(label);
    }
  });
  planted.unexpected.forEach((unexpected) => {
    const found = insights.find(
      (insight) =>
        transitionName(insight.question) === unexpected.transition &&
        unexpected.column in conditionsOf(insight) &&
        (unexpected.value === undefined ||
          conditionsOf(insight)[unexpected.column] === unexpected.value),
    );
    const label = `${unexpected.transition} | ${unexpected.column}${unexpected.value !== undefined ? ` = ${unexpected.value}` : ""}`;
    console.log(`  ${found ? "FAIL" : "ok  "} not found ${label}`);
    if (found) {
      failures.push(`unexpected ${label}`);
    }
  });

  // The panel draws the explore chart from the counts; the Explore link runs the SQL.
  console.log("\nExplore charts:");
  for (const insight of insights) {
    const total = counts.totals.get(insight.question);
    if (total === undefined) {
      continue;
    }
    const { rows } = await chRows(
      toSql({
        kind: "explore",
        question: insight.question,
        attributes: insight.conditions.map(({ attributeId }) => attributeId),
        segmentLabel: "segment",
        countColumn: "people",
        rateColumn: "conversion",
        minSize: getMinSegmentSize(total.reached),
        isDescending: isDescending(insight),
      }),
    );
    const fromSql = rows.map(([label, people, conversion]) => [
      String(label),
      Number(people),
      Number(conversion).toFixed(4),
    ]);
    const fromCounts = getInsightSegments(counts, insight).map(
      ({ label, reached, rate }) => [label, reached, rate.toFixed(4)],
    );
    const matches = Bun.deepEquals(fromSql, fromCounts);
    const label = `${transitionName(insight.question)} | ${describe(insight)}`;
    console.log(
      `  ${matches ? "ok  " : "FAIL"} ${label} (${fromSql.length} segments)`,
    );
    if (!matches) {
      console.log(`    SQL:    ${JSON.stringify(fromSql)}`);
      console.log(`    counts: ${JSON.stringify(fromCounts)}`);
      failures.push(`explore ${label}`);
    }
  }

  failures.push(...(await checkLifecycle()));
  failures.push(
    ...(await checkHabit({ subPeriod: "day", measure: "histogram" })),
  );
  failures.push(...(await checkHabit({ subPeriod: "week", measure: "ratio" })));

  if (failures.length > 0) {
    console.log(`\n${failures.length} check(s) failed`);
    process.exit(1);
  }
  console.log("\nAll checks passed");
};

/** The event segments lifecycle and habit compare people by, as in the README. */
const SEGMENTS = [
  { flag: FLAG.invite, name: "Sent an invite" },
  { flag: FLAG.report, name: "Created a report" },
  { flag: FLAG.error, name: "Hit an error" },
  { flag: FLAG.trial, name: "Started trial" },
  { flag: FLAG.integration, name: "Connected an integration" },
];
const SEGMENT_ATTRIBUTES: EventCountAttribute[] = SEGMENTS.flatMap(
  ({ flag }, segmentIndex) =>
    [1, 3, 10].map((minCount, index) => ({
      id: `attr_${segmentIndex * 3 + index + 1}`,
      flag,
      minCount,
    })),
);

const describeSegment = (insight: Insight) =>
  insight.conditions
    .map(({ attributeId, value }) => {
      const attribute = SEGMENT_ATTRIBUTES.find(({ id }) => id === attributeId);
      const name = SEGMENTS.find(({ flag }) => flag === attribute?.flag)?.name;
      return `${value === "true" ? "" : "not "}${name} ${attribute?.minCount}+`;
    })
    .join(" and ");

const segmentFlagOf = (insight: Insight) =>
  SEGMENT_ATTRIBUTES.find(({ id }) => id === insight.conditions[0]?.attributeId)
    ?.flag;

/** Whether an insight is that people who did the event at least once do better. */
const isHigherForSegment = (insight: Insight, flag: string) =>
  segmentFlagOf(insight) === flag &&
  insight.conditions[0]?.value === "true" &&
  insight.excess > 0;

/**
 * Searches an event-segment population over all of the data, in range so
 * nobody's history is cut off, prints what it finds, and checks the explore
 * chart's SQL against the counts. Returns the insights and any failures.
 */
const runSegmentInsights = async ({
  title,
  spec,
  population,
  questionName,
  unit,
}: {
  title: string;
  spec: AnalysisSpec;
  population: InsightPopulation;
  questionName: (question: number) => string;
  unit: string;
}): Promise<{ insights: Insight[]; failures: string[] }> => {
  const failures: string[] = [];
  const ids = SEGMENT_ATTRIBUTES.map(({ id }) => id);
  const baseSql = `SELECT person_id, session_id, event_id, created_at, event_name, url_path,
  person__first_seen_at, 1 AS ${IN_RANGE_FLAG},
  if(event_name = 'trial_started', 1, 0) AS ${FLAG.trial},
  if(startsWith(url_path, '/app') OR event_name IN ('report_created', 'invite_sent', 'checkout_completed'), 1, 0) AS ${FLAG.active},
  if(event_name = 'invite_sent', 1, 0) AS ${FLAG.invite},
  if(event_name = 'error', 1, 0) AS ${FLAG.error},
  if(event_name = 'report_created', 1, 0) AS ${FLAG.report},
  if(event_name = 'integration_connected', 1, 0) AS ${FLAG.integration}
FROM ${TABLE}`;
  const toSql = (query: InsightsQuery): string =>
    buildSql(
      spec,
      baseSql,
      {
        columns: {
          timestamp: "created_at",
          person: "person_id",
          session: "session_id",
          event_id: "event_id",
          event_name: "event_name",
          url_path: "url_path",
        },
        flags: [
          FLAG.trial,
          FLAG.active,
          FLAG.invite,
          FLAG.error,
          FLAG.report,
          FLAG.integration,
          IN_RANGE_FLAG,
        ],
        extraColumns: [
          { as: FIRST_SEEN_EXTRA_COLUMN, alias: "person__first_seen_at" },
        ],
      },
      planInsights(population, query),
    ).sql;

  console.log(`\n${title}:`);
  const started = performance.now();
  const { names, rows } = await chRows(
    toSql({ kind: "singles", attributes: ids }),
  );
  console.log(
    `  singles: ${rows.length} rows in ${Math.round(performance.now() - started)}ms`,
  );
  const labels = parseQuestionLabels(names, rows);
  if (labels.size > 0) {
    console.log(
      `  labels: ${[...labels].map(([question, label]) => `${questionName(question)} ${label}`).join(", ")}`,
    );
  }
  const counts = indexCounts({
    rows: parseCountRows(names, rows, ids),
    singleAttributes: ids,
  });
  [...counts.totals].forEach(([question, total]) =>
    console.log(
      `  ${questionName(question)}: ${total.reached} ${unit}, ${((total.converted / total.reached) * 100).toFixed(1)}% converted`,
    ),
  );
  const insights = findInsights(counts);
  insights.forEach((insight) =>
    console.log(
      `  ${questionName(insight.question)} | ${describeSegment(insight)} | ` +
        `${(insight.rate * 100).toFixed(1)}% vs ${(insight.restRate * 100).toFixed(1)}% expected | ` +
        `${insight.reached} ${unit} | excess ${insight.excess.toFixed(0)} | p ${insight.pValue.toExponential(1)}`,
    ),
  );

  for (const insight of insights) {
    const total = counts.totals.get(insight.question);
    if (total === undefined) {
      continue;
    }
    const explore = await chRows(
      toSql({
        kind: "explore",
        question: insight.question,
        attributes: insight.conditions.map(({ attributeId }) => attributeId),
        segmentLabel: "segment",
        countColumn: "size",
        rateColumn: "rate",
        expectedRateColumn: "expected_rate",
        minSize: getMinSegmentSize(total.reached),
        isDescending: isDescending(insight),
      }),
    );
    const fromSql = explore.rows.map(([label, size, rate, expected]) => [
      String(label),
      Number(size),
      Number(rate).toFixed(4),
      Number(expected).toFixed(4),
    ]);
    const fromCounts = getInsightSegments(counts, insight).map((segment) => [
      segment.label,
      segment.reached,
      segment.rate.toFixed(4),
      (getExpectedRate(segment) ?? 0).toFixed(4),
    ]);
    if (!Bun.deepEquals(fromSql, fromCounts)) {
      const label = `${title} explore ${JSON.stringify(insight.conditions)}`;
      console.log(`  FAIL ${label}`);
      console.log(`    SQL:    ${JSON.stringify(fromSql)}`);
      console.log(`    counts: ${JSON.stringify(fromCounts)}`);
      failures.push(label);
    }
  }
  return { insights, failures };
};

const expectFound = (
  failures: string[],
  label: string,
  isFound: boolean,
): void => {
  console.log(`  ${isFound ? "ok  " : "FAIL"} found ${label}`);
  if (!isFound) {
    failures.push(label);
  }
};

const expectNotFound = (
  failures: string[],
  label: string,
  isFound: boolean,
): void => {
  console.log(`  ${isFound ? "FAIL" : "ok  "} not found ${label}`);
  if (isFound) {
    failures.push(`unexpected ${label}`);
  }
};

/**
 * Lifecycle insights compare people by the events they did in a week, against
 * people as active as them. The generator plants reasons to come back: people
 * who invite someone in their first week are more active from then on, and so
 * are people who connect an integration later. Errors come with heavy use,
 * like everything else, but change nothing, so they mustn't show up once
 * people are compared with others as active.
 */
const checkLifecycle = async (): Promise<string[]> => {
  const population = lifecycleInsightPopulation(
    defaultSpec("lifecycle"),
    SEGMENT_ATTRIBUTES,
  );
  if (population === undefined) {
    throw new Error("The lifecycle spec has no lifecycle.");
  }
  const states = ["new", "returning", "resurrected"];
  const { insights, failures } = await runSegmentInsights({
    title: "Lifecycle, by week",
    spec: defaultSpec("lifecycle"),
    population,
    questionName: (question) => states[question - 1] ?? String(question),
    unit: "active weeks",
  });
  expectFound(
    failures,
    "lifecycle new | Sent an invite, higher",
    insights.some(
      (insight) =>
        insight.question === 1 && isHigherForSegment(insight, FLAG.invite),
    ),
  );
  expectNotFound(
    failures,
    "lifecycle | Hit an error, at any state",
    insights.some((insight) => segmentFlagOf(insight) === FLAG.error),
  );
  return failures;
};

/**
 * Habit insights ask what people do in a week that makes them regulars over
 * the next 4. Inviting someone in the first week and connecting an integration
 * later both raise how often people are active from then on, so they should
 * show up for new people and everyone else.
 *
 * By day, errors shouldn't show up, as in lifecycle. By week, being active
 * every week of the next 4 is a coarse outcome, and errors come out slightly
 * worse: they're activity, so people with errors are compared with people
 * busier than them. By week also runs with WAU/MAU's lookback, though all
 * the data here is in range.
 */
const checkHabit = async (
  habit: Pick<HabitSpec, "subPeriod" | "measure">,
): Promise<string[]> => {
  const daySpec = defaultSpec("habit");
  const spec: AnalysisSpec = {
    ...daySpec,
    habit: daySpec.habit && { ...daySpec.habit, ...habit },
  };
  const population = habitInsightPopulation(spec, SEGMENT_ATTRIBUTES);
  if (population === undefined) {
    throw new Error("The habit spec has no habit.");
  }
  const { insights, failures } = await runSegmentInsights({
    title: `Habit, by ${habit.subPeriod}, ${habit.measure}`,
    spec,
    population,
    questionName: (question) =>
      question === HABIT_INSIGHT_QUESTIONS.new ? "new" : "everyone else",
    unit: "active weeks",
  });
  expectFound(
    failures,
    `habit by ${habit.subPeriod} new | Sent an invite, higher`,
    insights.some(
      (insight) =>
        insight.question === HABIT_INSIGHT_QUESTIONS.new &&
        isHigherForSegment(insight, FLAG.invite),
    ),
  );
  expectFound(
    failures,
    `habit by ${habit.subPeriod} everyone else | Connected an integration, higher`,
    insights.some(
      (insight) =>
        insight.question === HABIT_INSIGHT_QUESTIONS.rest &&
        isHigherForSegment(insight, FLAG.integration),
    ),
  );
  if (habit.subPeriod === "day") {
    expectNotFound(
      failures,
      "habit by day | Hit an error",
      insights.some((insight) => segmentFlagOf(insight) === FLAG.error),
    );
  }
  return failures;
};

await main();
