import { match } from "ts-pattern";
import { t } from "ttag";

import { formatDurationShort } from "metabase/utils/formatting/duration";

import type { AnalysisSpec, Duration, FunnelSpec } from "../../spec/types";
import { seconds } from "../compile/actorPredicate";
import { bucket, dateTimeLit, lit } from "../compile/dialect";
import { flagSql } from "../compile/flag";
import { grainLabel } from "../compile/grain";
import type { Cte, DrillPoint, QueryPlan } from "../compose";

import {
  type BaseBlock,
  parseStepLabel,
  pointString,
  scopedEvents,
} from "./base";
import {
  ACTOR_BREAKOUTS_CTE,
  BREAKOUT_COLUMN,
  breakoutDrillCondition,
  breakoutGroupBy,
  breakoutOrderBy,
  breakoutSelect,
  withBreakout,
} from "./breakout";

const MODE: Record<string, string> = {
  strict: ", 'strict_order'",
  loose: "",
  any: "",
};

/** The "Step by step" view's label for a step, numbered from 1. */
export const getFunnelStepLabel = (stepNumber: number, name: string): string =>
  `${stepNumber}. ${name}`;

/** The step flags, plus the disqualifier flags, on `scoped_events`. */
export const funnelFlags = (funnel: FunnelSpec) => [
  ...funnel.steps.map((step, index) => ({
    as: `step_${index + 1}`,
    sql: flagSql(step.flag),
  })),
  ...funnel.exclusions.map((exclusion, index) => ({
    as: `excl_${index + 1}`,
    sql: flagSql(exclusion.flag),
  })),
];

/**
 * When each actor first did each step: `t_1` … `t_n`. Not for durations,
 * which need one run through the steps; see `funnelChainsCte`.
 */
export const funnelStepTimes = (funnel: FunnelSpec): string =>
  funnel.steps
    .map((_, index) => `  minIf(ts, step_${index + 1}) AS t_${index + 1}`)
    .join(",\n");

/** Whether each actor did each step at all: `hit_1` … `hit_n`. */
export const funnelHits = (funnel: FunnelSpec): string =>
  funnel.steps
    .map((_, index) => `  countIf(step_${index + 1}) > 0 AS hit_${index + 1}`)
    .join(",\n");

/**
 * Per-actor aggregates ending in `level`, how far the actor got in order.
 * Only for orderings that enforce one; see `funnelHits` for "any".
 */
export const funnelOrderedLevel = (
  funnel: FunnelSpec,
): { sql: string; warnings: string[] } => {
  const window = seconds(funnel.window);
  const n = funnel.steps.length;

  if (funnel.anchor === "each" && n > 1) {
    const pairs = funnel.steps
      .slice(0, -1)
      .map(
        (_, index) =>
          `  windowFunnel(${window})(ts, step_${index + 1}, step_${index + 2}) AS pair_${index + 1}`,
      );
    const ladder = funnel.steps
      .map((_, index) => {
        if (index === 0) {
          return null;
        }
        const conds = Array.from(
          { length: index },
          (_, k) => `pair_${k + 1} >= 2`,
        ).join(" AND ");
        return `    ${conds}, ${index + 1}`;
      })
      .filter((branch): branch is string => branch !== null)
      .reverse();
    const chooser = [
      "  multiIf(",
      ...ladder.map((branch) => `${branch},`),
      "    countIf(step_1) > 0, 1,",
      "    0",
      "  ) AS level",
    ].join("\n");
    return {
      sql: [pairs.join(",\n"), chooser].join(",\n"),
      warnings: [
        "“Counted fresh from each step” evaluates each hop's window on its own, so an actor who completes a later hop before an earlier one is still counted. windowFunnel cannot re-anchor inside a single call.",
      ],
    };
  }

  return {
    sql:
      `  windowFunnel(${window}${MODE[funnel.ordering] ?? ""})(\n` +
      "    ts,\n" +
      funnel.steps.map((_, index) => `    step_${index + 1}`).join(",\n") +
      "\n  ) AS level",
    warnings: [],
  };
};

const stepNumbers = (funnel: FunnelSpec): number[] =>
  funnel.steps.map((_, index) => index + 1);

/**
 * Each actor's run through the steps: `chain_times[k]` is when they got to
 * step k, and `chain_left[k]` when they went on from it. Of the runs from each
 * of their first-step events, it's the one that gets furthest, then the
 * earliest. Each step is the next step's first event after the one before,
 * within the window from the first step. Counted from each step instead, it's
 * the latest that gets furthest, a later step done again before the next one
 * goes on from its latest time, and the window runs from there. In a loose
 * order these are runs windowFunnel counts.
 *
 * Measure durations with these, not `t_k`: a step's first time ever can come
 * from another run, like an earlier visit that went nowhere.
 */
export const funnelChainsCte = (funnel: FunnelSpec): Cte => {
  const n = funnel.steps.length;
  const steps = stepNumbers(funnel);
  const isEach = funnel.anchor === "each";
  const windowStart = isEach ? "run.2[-1]" : "run.1[1]";
  const advance = [
    `          length(run.1) < ${n} AND e.2[length(run.1) + 1] = 1`,
    `            AND dateDiff('second', ${windowStart}, e.1) <= ${seconds(funnel.window)},`,
    "          (arrayPushBack(run.1, e.1), arrayPushBack(run.2, e.1)),",
  ];
  const stayLonger = isEach
    ? [
        `          length(run.1) BETWEEN 2 AND ${n - 1} AND e.2[length(run.1)] = 1,`,
        "          (run.1, arrayPushBack(arrayPopBack(run.2), e.1)),",
      ]
    : [];
  return {
    name: "funnel_chains",
    note: "each actor's run through the steps: when they got to each one, and when they went on",
    deps: ["scoped_events"],
    body: [
      "SELECT",
      "  actor,",
      `  arraySort(groupArrayIf((ts, [${steps.map((k) => `toUInt8(step_${k})`).join(", ")}]), ${steps.map((k) => `step_${k}`).join(" OR ")})) AS step_events,`,
      "  arraySort(",
      // A run that went nowhere is placed at its first step's first time.
      `    run -> (-length(run.1), ${isEach ? "if(length(run.1) > 1, -1, 1) * toUnixTimestamp(run.1[1])" : "run.1[1]"}),`,
      "    arrayMap(",
      "      start -> arrayFold(",
      "        (run, e) -> multiIf(",
      ...advance,
      ...stayLonger,
      "          run",
      "        ),",
      "        arraySlice(step_events, start + 1),",
      "        ([step_events[start].1], [step_events[start].1])",
      "      ),",
      "      arrayFilter(i -> step_events[i].2[1] = 1, arrayEnumerate(step_events))",
      "    )",
      "  )[1] AS best_run,",
      "  best_run.1 AS chain_times,",
      "  best_run.2 AS chain_left",
      "FROM scoped_events",
      "GROUP BY actor",
    ].join("\n"),
  };
};

export type FunnelLevels = {
  ctes: Cte[];
  /** The CTE with one row per kept actor: `level` (or `hit_k`) and `t_1` … `t_n`. */
  source: string;
  base: BaseBlock;
  warnings: string[];
};

/**
 * `scoped_events` with the step flags (plus `extraColumns`), then one row per
 * actor with how far they got, without the disqualified actors.
 */
export const funnelLevels = (
  spec: AnalysisSpec,
  funnel: FunnelSpec,
  extraColumns: { as: string; sql: string }[] = [],
): FunnelLevels => {
  const warnings: string[] = [];
  const n = funnel.steps.length;

  const base = scopedEvents(spec, undefined, [
    ...funnelFlags(funnel),
    ...extraColumns,
  ]);
  warnings.push(...base.warnings);

  let levelExpr: string;
  if (funnel.ordering === "any") {
    levelExpr = funnelHits(funnel);
  } else {
    const ordered = funnelOrderedLevel(funnel);
    levelExpr = ordered.sql;
    warnings.push(...ordered.warnings);
  }

  const levels: Cte = {
    name: "funnel_levels",
    note:
      funnel.ordering === "any"
        ? "one row per actor, with a flag per step — order is not enforced"
        : `one row per actor: how far they got within ${funnel.window.value} ${funnel.window.unit}s`,
    deps: ["scoped_events"],
    body: [
      "SELECT",
      "  actor,",
      levelExpr + ",",
      funnelStepTimes(funnel),
      "FROM scoped_events",
      "GROUP BY actor",
    ]
      .filter(Boolean)
      .join("\n"),
  };

  const ctes: Cte[] = [...base.ctes, levels];

  let source = "funnel_levels";
  if (funnel.exclusions.length > 0) {
    const clauses = funnel.exclusions.map((exclusion, index) => {
      const from = Math.min(exclusion.fromStep, n - 1) + 1;
      const to = Math.min(exclusion.toStep, n - 1) + 1;
      return [
        "    SELECT x.actor",
        "    FROM scoped_events AS x",
        "    INNER JOIN funnel_levels AS b ON b.actor = x.actor",
        `    WHERE x.excl_${index + 1}`,
        `      AND x.ts > b.t_${from}`,
        `      AND x.ts < b.t_${to}`,
      ].join("\n");
    });
    ctes.push({
      name: "funnel_kept",
      note: "actors who were not disqualified between the named steps",
      deps: ["funnel_levels", "scoped_events"],
      body: [
        "SELECT *",
        "FROM funnel_levels",
        "WHERE actor NOT IN (",
        clauses.join("\n    UNION ALL\n"),
        ")",
      ].join("\n"),
    });
    source = "funnel_kept";
    warnings.push(
      "Disqualifiers re-scan the event stream and join it back to the step bounds, so the funnel is read twice.",
    );
  }

  return { ctes, source, base, warnings };
};

const MINUTE_SECONDS = 60;
const HOUR_SECONDS = 60 * MINUTE_SECONDS;
const DAY_SECONDS = 24 * HOUR_SECONDS;

const TIME_TO_CONVERT_EDGES_SECONDS = [
  0,
  10,
  30,
  MINUTE_SECONDS,
  5 * MINUTE_SECONDS,
  15 * MINUTE_SECONDS,
  30 * MINUTE_SECONDS,
  HOUR_SECONDS,
  2 * HOUR_SECONDS,
  4 * HOUR_SECONDS,
  8 * HOUR_SECONDS,
  12 * HOUR_SECONDS,
  DAY_SECONDS,
  2 * DAY_SECONDS,
  3 * DAY_SECONDS,
  5 * DAY_SECONDS,
  7 * DAY_SECONDS,
  14 * DAY_SECONDS,
  30 * DAY_SECONDS,
  60 * DAY_SECONDS,
  90 * DAY_SECONDS,
  180 * DAY_SECONDS,
  365 * DAY_SECONDS,
];

/**
 * The "Step by step" view's column the chart's tooltip reads. Keep in sync
 * with `FUNNEL_STEPS_MEDIAN_SECONDS_COLUMN`; this module stays clear of chart code.
 */
export const MEDIAN_SECONDS_FROM_PREVIOUS_COLUMN =
  "median_seconds_from_previous";

/** The "How long it took" view's duration column. */
export const TIME_TO_CONVERT_COLUMN = "time_to_convert";

export type TimeToConvertBucket = {
  /** Numbered from 1, in order. */
  index: number;
  fromSeconds: number;
  label: string;
};

/**
 * The "How long it took" view's duration ranges: narrow where most people
 * finish, wider toward the end of the funnel's window, then one for anyone
 * who took longer, which counting from each step allows.
 */
export const getTimeToConvertBuckets = (
  window: Duration,
): TimeToConvertBucket[] => {
  const windowSeconds = seconds(window);
  const edges = [
    ...TIME_TO_CONVERT_EDGES_SECONDS.filter((edge) => edge < windowSeconds),
    windowSeconds,
  ];
  const format = (value: number) => formatDurationShort(value * 1000);
  return edges.map((fromSeconds, index) => {
    const toSeconds: number | undefined = edges[index + 1];
    const label = match({ fromSeconds, toSeconds })
      .with({ toSeconds: undefined }, () => t`${format(fromSeconds)}+`)
      .with({ fromSeconds: 0 }, () => t`< ${format(toSeconds)}`)
      .otherwise(() => t`${format(fromSeconds)}–${format(toSeconds)}`);
    return { index: index + 1, fromSeconds, label };
  });
};

/** Whether an actor got as far as `step`, a SQL expression for a step number. */
const reachedStepSql = (funnel: FunnelSpec, step: string): string =>
  funnel.ordering === "any"
    ? `[${stepNumbers(funnel)
        .map((k) => `hit_${k}`)
        .join(", ")}][${step}]`
    : `level >= ${step}`;

const finishedSql = (funnel: FunnelSpec): string =>
  funnel.ordering === "any"
    ? stepNumbers(funnel)
        .map((k) => `hit_${k}`)
        .join(" AND ")
    : `level >= ${funnel.steps.length}`;

/** How long a finished actor took, in seconds. In any order, from their first step to their last. */
const conversionSecondsSql = (funnel: FunnelSpec): string => {
  if (funnel.ordering === "any") {
    const times = `[${stepNumbers(funnel)
      .map((k) => `t_${k}`)
      .join(", ")}]`;
    return `dateDiff('second', arrayMin(${times}), arrayMax(${times}))`;
  }
  return `dateDiff('second', chain_times[1], chain_times[${funnel.steps.length}])`;
};

/** Finished, with a run to time; counting from each step can finish without one. */
const finishedWithTimesSql = (funnel: FunnelSpec): string =>
  funnel.ordering === "any"
    ? finishedSql(funnel)
    : `${finishedSql(funnel)} AND length(chain_times) >= ${funnel.steps.length}`;

/** When an actor started the funnel. */
const startSql = (funnel: FunnelSpec): string =>
  funnel.ordering === "any" ? "t_1" : "chain_times[1]";

const startedSql = (funnel: FunnelSpec): string =>
  funnel.ordering === "any" ? "t_1 > 0" : "notEmpty(chain_times)";

const timeBucketSql = (
  funnel: FunnelSpec,
  buckets: TimeToConvertBucket[],
): string =>
  `arrayCount(edge -> edge <= ${conversionSecondsSql(funnel)}, [${buckets
    .map((timeBucket) => timeBucket.fromSeconds)
    .join(", ")}])`;

/**
 * The median seconds from the previous step, among the actors who reached
 * each step. NULL for the first step and for steps no one reached.
 */
const medianSecondsFromPreviousSql = (funnel: FunnelSpec): string => {
  const hop = `[0, ${stepNumbers(funnel)
    .slice(1)
    .map((k) => `dateDiff('second', chain_left[${k - 1}], chain_times[${k}])`)
    .join(", ")}][step]`;
  const condition =
    "step > 1 AND level >= step AND length(chain_times) >= step";
  return `if(countIf(${condition}) = 0, NULL, round(quantileIf(0.5)(${hop}, ${condition})))`;
};

export const planFunnel = (spec: AnalysisSpec): QueryPlan => {
  const funnel = spec.funnel;
  if (!funnel || funnel.steps.length === 0) {
    return {
      ctes: [],
      select: "SELECT 'Add at least one step' AS message",
      warnings: ["The funnel has no steps yet."],
    };
  }

  const n = funnel.steps.length;
  const levels = funnelLevels(spec, funnel);
  const { ctes, warnings } = levels;
  let source = levels.source;
  if (funnel.ordering !== "any") {
    ctes.push(funnelChainsCte(funnel), {
      name: "funnel_timed",
      note: "each actor's level, with their run through the steps",
      deps: [source, "funnel_chains"],
      body: [
        "SELECT l.*, c.chain_times AS chain_times, c.chain_left AS chain_left",
        `FROM ${source} AS l`,
        "LEFT JOIN funnel_chains AS c ON c.actor = l.actor",
      ].join("\n"),
    });
    source = "funnel_timed";
  }

  if (spec.breakout !== undefined) {
    ctes.push({
      name: "funnel_broken_out",
      note: "each actor's row once per group they're in",
      deps: [source, ACTOR_BREAKOUTS_CTE],
      body: `SELECT * FROM ${withBreakout(spec, source)}`,
    });
    source = "funnel_broken_out";
  }

  if (funnel.allowRetry) {
    warnings.push(
      "“Let someone try more than once” is not modelled — each actor is counted at their deepest single attempt. Multiple attempts need the stream sessionised first.",
    );
  }

  const stepArray = (steps: number[]) =>
    `ARRAY JOIN [${steps.join(", ")}] AS step, [${steps
      .map((step) => lit(funnel.steps[step - 1].label))
      .join(", ")}] AS step_name`;

  // Keep in sync with `getFunnelStepLabel`.
  const stepLabel = "concat(toString(step), '. ', step_name)";
  const view = spec.output.funnelView ?? "steps";
  const people = grainLabel(spec.grain);
  const timeBuckets = getTimeToConvertBuckets(funnel.window);
  const isBrokenOut = spec.breakout !== undefined;
  const orderBy = (...columns: string[]) =>
    `ORDER BY ${[...breakoutOrderBy(spec), ...columns].join(", ")}`;
  let select: string;

  if (view === "overTime" && isBrokenOut) {
    // A line per group, of how many got to the last step: a line per step per
    // group would be one dimension too many.
    select = [
      "SELECT",
      `  ${bucket(startSql(funnel), spec.bucket.granularity)} AS period,`,
      `  ${BREAKOUT_COLUMN},`,
      `  round(countIf(${finishedSql(funnel)}) / nullIf(count(), 0), 4) AS conversion`,
      `FROM ${source}`,
      `WHERE ${startedSql(funnel)}`,
      `GROUP BY period, ${BREAKOUT_COLUMN}`,
      orderBy("period"),
    ].join("\n");
  } else if (view === "overTime") {
    // A line per step after the first, which everyone in a period reached.
    const lineSteps = n > 1 ? stepNumbers(funnel).slice(1) : [1];
    select = [
      "SELECT",
      `  ${bucket(startSql(funnel), spec.bucket.granularity)} AS period,`,
      `  ${stepLabel} AS label,`,
      `  round(countIf(${reachedStepSql(funnel, "step")}) / nullIf(count(), 0), 4) AS conversion`,
      `FROM ${source}`,
      stepArray(lineSteps),
      `WHERE ${startedSql(funnel)}`,
      "GROUP BY period, step, step_name",
      "ORDER BY period, step",
    ].join("\n");
  } else if (view === "timeToConvert") {
    ctes.push({
      name: "conversion_times",
      note: "the duration range each actor who finished took",
      deps: [source],
      // Broken out, everyone stays in with no range unless they finished,
      // so a group nobody in finished still gets its rows.
      body: isBrokenOut
        ? [
            "SELECT",
            ...breakoutSelect(spec),
            `  if(${finishedWithTimesSql(funnel)}, ${timeBucketSql(funnel, timeBuckets)}, NULL) AS time_bucket`,
            `FROM ${source}`,
          ].join("\n")
        : [
            "SELECT",
            `  ${timeBucketSql(funnel, timeBuckets)} AS time_bucket`,
            `FROM ${source}`,
            `WHERE ${finishedWithTimesSql(funnel)}`,
          ].join("\n"),
    });
    select = [
      "SELECT",
      `  bucket_label AS ${TIME_TO_CONVERT_COLUMN},`,
      ...breakoutSelect(spec),
      `  countIf(time_bucket = bucket) AS ${people}`,
      "FROM conversion_times",
      `ARRAY JOIN [${timeBuckets.map((timeBucket) => timeBucket.index).join(", ")}] AS bucket, [${timeBuckets.map((timeBucket) => lit(timeBucket.label)).join(", ")}] AS bucket_label`,
      `GROUP BY ${breakoutGroupBy(spec)}bucket, bucket_label`,
      // From the fastest anyone took, and past the window only when someone did.
      "HAVING bucket >= (SELECT min(time_bucket) FROM conversion_times)",
      `  AND (bucket < ${timeBuckets.length} OR ${people} > 0)`,
      orderBy("bucket"),
    ].join("\n");
  } else {
    const isOrdered = funnel.ordering !== "any";
    select = [
      "SELECT",
      `  ${stepLabel} AS label,`,
      ...breakoutSelect(spec),
      `  countIf(${reachedStepSql(funnel, "step")}) AS ${people}${isOrdered ? "," : ""}`,
      ...(isOrdered
        ? [
            `  ${medianSecondsFromPreviousSql(funnel)} AS ${MEDIAN_SECONDS_FROM_PREVIOUS_COLUMN}`,
          ]
        : []),
      `FROM ${source}`,
      stepArray(stepNumbers(funnel)),
      `GROUP BY ${breakoutGroupBy(spec)}step, step_name`,
      orderBy("step"),
    ].join("\n");
  }

  const members = (point: DrillPoint): string | null => {
    const inGroup = breakoutDrillCondition(spec, point[BREAKOUT_COLUMN]);
    const from = `SELECT DISTINCT actor FROM ${source}`;
    if (view === "overTime") {
      const period = pointString(point.period);
      if (period === null) {
        return null;
      }
      // Broken out, each line is the last step's.
      const step = isBrokenOut ? n : parseStepLabel(point.label)?.step;
      const reached =
        step !== undefined && step >= 1 && step <= n
          ? ` AND ${reachedStepSql(funnel, String(step))}`
          : "";
      return `${from}\nWHERE ${startedSql(funnel)} AND ${bucket(startSql(funnel), spec.bucket.granularity)} = ${dateTimeLit(period)}${reached}${inGroup}`;
    }
    if (view === "timeToConvert") {
      const label = pointString(point[TIME_TO_CONVERT_COLUMN]);
      const timeBucket = timeBuckets.find(
        (timeBucket) => timeBucket.label === label,
      );
      return timeBucket === undefined
        ? null
        : `${from}\nWHERE ${finishedWithTimesSql(funnel)} AND ${timeBucketSql(funnel, timeBuckets)} = ${timeBucket.index}${inGroup}`;
    }
    const step = parseStepLabel(point.label)?.step;
    if (step === undefined || step < 1 || step > n) {
      return null;
    }
    return `${from}\nWHERE ${reachedStepSql(funnel, String(step))}${inGroup}`;
  };

  return { ctes, select, warnings, members };
};
