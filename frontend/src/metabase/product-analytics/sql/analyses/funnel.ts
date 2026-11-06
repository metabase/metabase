import { match } from "ts-pattern";
import { msgid, ngettext, t } from "ttag";

import { formatDurationShort } from "metabase/utils/formatting/duration";

import type { AnalysisSpec, Duration, FunnelSpec } from "../../spec/types";
import { seconds } from "../compile/actorPredicate";
import { bucket, dateTimeLit, lit } from "../compile/dialect";
import { flagSql } from "../compile/flag";
import { grainLabel } from "../compile/grain";
import {
  type Cte,
  DROPPED_OFF_POINT_KEY,
  type DrillPoint,
  type QueryPlan,
} from "../compose";

import { pointString, scopedEvents } from "./base";
import {
  ACTOR_BREAKOUTS_CTE,
  BREAKOUT_COLUMN,
  breakoutDrillCondition,
  breakoutGroupBy,
  breakoutOrderBy,
  breakoutSelect,
  withBreakout,
} from "./breakout";

/**
 * The step labels the funnel's results carry, in step order. In order, a step
 * is named after its event. In any order, the k-th bar is everyone who did
 * any k of the steps, so it can't be named after one of them.
 */
export const getFunnelStepLabels = (
  stepNames: string[],
  ordering: FunnelSpec["ordering"],
): string[] =>
  stepNames.map((name, index) => {
    const count = index + 1;
    return ordering === "any"
      ? ngettext(
          msgid`Completed ${count} step`,
          `Completed ${count} steps`,
          count,
        )
      : `${count}. ${name}`;
  });

/** Which step a clicked label is, numbered from 1, or `null` if it's none of them. */
export const getFunnelStepNumber = (
  labels: string[],
  label: unknown,
): number | null => {
  const index = labels.indexOf(pointString(label) ?? "");
  return index >= 0 ? index + 1 : null;
};

/** The disqualifiers a funnel reads: only in order with other actions allowed. */
const getExclusions = (funnel: FunnelSpec) =>
  funnel.ordering === "loose" ? funnel.exclusions : [];

/** The step flags, plus the disqualifier flags, on `scoped_events`. */
const funnelFlags = (funnel: FunnelSpec) => [
  ...funnel.steps.map((step, index) => ({
    as: `step_${index + 1}`,
    sql: flagSql(step.flag),
  })),
  ...getExclusions(funnel).map((exclusion, index) => ({
    as: `excl_${index + 1}`,
    sql: flagSql(exclusion.flag),
  })),
];

const stepNumbers = (funnel: FunnelSpec, from = 1): number[] =>
  funnel.steps.map((_, index) => index + 1).filter((step) => step >= from);

/**
 * For each hop k, from step k - 1 to step k, the disqualifiers between steps
 * that span it. Steps past the last one count as the last one.
 */
const hopExclusions = (funnel: FunnelSpec): Map<number, number[]> => {
  const lastStep = funnel.steps.length;
  const ranges = getExclusions(funnel).map((exclusion, index) => ({
    excl: index + 1,
    from: Math.min(exclusion.fromStep + 1, lastStep),
    to: Math.min(exclusion.toStep + 1, lastStep),
  }));
  return new Map(
    stepNumbers(funnel, 2)
      .map((hop): [number, number[]] => [
        hop,
        ranges
          .filter(({ from, to }) => from < hop && hop <= to)
          .map(({ excl }) => excl),
      ])
      .filter(([, excls]) => excls.length > 0),
  );
};

const BY_ROW = "PARTITION BY actor ORDER BY rn";
/** Every later row, as a frame that only grows, so each row costs O(1). */
const AFTER = `OVER (PARTITION BY actor ORDER BY rn DESC ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING)`;
/** This row and every later one, likewise. */
const FROM_HERE = `OVER (PARTITION BY actor ORDER BY rn DESC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)`;

/**
 * Each actor's rows in a total order: by time, then, at the same time,
 * disqualifiers, the steps in order, and anything else.
 */
const funnelRowsCte = (funnel: FunnelSpec): Cte => {
  const exclusions = getExclusions(funnel);
  const isStrict = funnel.ordering === "strict";
  const steps = stepNumbers(funnel).map((k) => `step_${k}`);
  const excls = exclusions.map((_, index) => `excl_${index + 1}`);
  const order = [
    ...(excls.length > 0 ? [`${excls.join(" OR ")}, 0`] : []),
    ...steps.map((step, index) => `${step}, ${index + 1}`),
    String(steps.length + 1),
  ].join(", ");
  return {
    name: "funnel_rows",
    note: isStrict
      ? "every event, in order: in strict order, anything else interrupts"
      : "the step and disqualifier events, in order",
    deps: ["scoped_events"],
    body: [
      "SELECT",
      `  actor, ts, ${[...steps, ...excls].join(", ")},`,
      `  row_number() OVER (PARTITION BY actor ORDER BY ts, multiIf(${order})) AS rn`,
      "FROM scoped_events",
      ...(isStrict ? [] : [`WHERE ${[...steps, ...excls].join(" OR ")}`]),
    ].join("\n"),
  };
};

/**
 * In order, the run from each step-1 row takes the first step-2 row after it,
 * then the first step-3 row after that, and so on. Built from the last step
 * back, `c{j}_{k}` is when that run reaches step k if it starts looking for
 * step j after the row. A later start never reaches a step earlier, so the
 * run from the first step-j row after a row is the column-wise minimum over
 * every step-j row after it. `x{j}_{k}` carries, the same way, the first
 * disqualifier for hop k after the run's step k - 1.
 */
const funnelLooseStages = (funnel: FunnelSpec): Cte[] => {
  const n = funnel.steps.length;
  const hops = hopExclusions(funnel);
  const nextExclusions = [...hops].map(
    ([hop, excls]) =>
      `min(if(${excls.map((index) => `excl_${index}`).join(" OR ")}, ts, NULL)) ${AFTER} AS d${hop}`,
  );
  return stepNumbers(funnel, 2)
    .reverse()
    .map((j) => {
      const later = stepNumbers(funnel, j + 1);
      const columns = [
        `min(if(step_${j}, ts, NULL)) ${AFTER} AS c${j}_${j}`,
        ...later.map(
          (k) =>
            `min(if(step_${j}, c${j + 1}_${k}, NULL)) ${AFTER} AS c${j}_${k}`,
        ),
        ...later
          .filter((k) => hops.has(k))
          .map((k) =>
            k === j + 1
              ? `min(if(step_${j}, d${k}, NULL)) ${AFTER} AS x${j}_${k}`
              : `min(if(step_${j}, x${j + 1}_${k}, NULL)) ${AFTER} AS x${j}_${k}`,
          ),
        ...(j === n ? nextExclusions : []),
      ];
      return {
        name: `funnel_from_step_${j}`,
        note:
          j === n
            ? "when each row's run would reach the last step, and the next disqualifiers"
            : `when each row's run would reach steps ${j}–${n}`,
        deps: [j === n ? "funnel_rows" : `funnel_from_step_${j + 1}`],
        body: `SELECT *,\n  ${columns.join(",\n  ")}\nFROM ${j === n ? "funnel_rows" : `funnel_from_step_${j + 1}`}`,
      };
    });
};

/** In strict order, the run from each row is the rows right after it. */
const funnelStrictNextCte = (funnel: FunnelSpec): Cte => ({
  name: "funnel_next",
  note: "the rows right after each one",
  deps: ["funnel_rows"],
  body: [
    "SELECT",
    [
      "  *",
      ...stepNumbers(funnel, 2).flatMap((k) => [
        `  lead(ts, ${k - 1}) OVER (${BY_ROW}) AS r_${k}`,
        `  lead(step_${k}, ${k - 1}) OVER (${BY_ROW}) AS s_${k}`,
      ]),
    ].join(",\n"),
    "FROM funnel_rows",
  ].join("\n"),
});

/** In any order, the first time of each step from each row on. */
const funnelAnyFromCte = (funnel: FunnelSpec): Cte => ({
  name: "funnel_from",
  note: "the first time of each step from each row on",
  deps: ["funnel_rows"],
  body: [
    "SELECT *,",
    stepNumbers(funnel)
      .map((k) => `  min(if(step_${k}, ts, NULL)) ${FROM_HERE} AS f_${k}`)
      .join(",\n"),
    "FROM funnel_rows",
  ].join("\n"),
});

/** The largest k whose hops 2..k all hold. */
const levelSql = (funnel: FunnelSpec, holds: (hop: number) => string) => {
  const ladder = stepNumbers(funnel, 2)
    .reverse()
    .map(
      (k) =>
        `${stepNumbers(funnel, 2)
          .filter((hop) => hop <= k)
          .map(holds)
          .join(" AND ")}, ${k}`,
    );
  return ladder.length > 0 ? `multiIf(${ladder.join(", ")}, 1)` : "1";
};

type AttemptsOptions = {
  stages: Cte[];
  /** `r_k`, when the attempt did step k, for the steps the stages don't name so. */
  rawTimes: string[];
  level: string;
  /** Whether the attempt counts as having done step k. */
  didStep: (k: number) => string;
  started: string;
  finished: string;
  /** Which of the last stage's rows start an attempt. */
  where: string | null;
};

const attemptsCtes = (
  funnel: FunnelSpec,
  {
    stages,
    rawTimes,
    level,
    didStep,
    started,
    finished,
    where,
  }: AttemptsOptions,
): Cte[] => {
  const source = stages.at(-1)?.name ?? "funnel_rows";
  return [
    ...stages,
    {
      name: "funnel_attempts",
      note: "each attempt: how far it got, and when it did each step",
      deps: [source],
      body: [
        "SELECT",
        "  actor,",
        ...rawTimes.map((raw) => `  ${raw},`),
        `  ${level} AS a_level,`,
        `  ${started} AS a_started,`,
        `  ${finished} AS a_finished,`,
        stepNumbers(funnel)
          .map((k) => `  if(${didStep(k)}, r_${k}, NULL) AS a_t_${k}`)
          .join(",\n"),
        `FROM ${source}`,
        ...(where !== null ? [`WHERE ${where}`] : []),
      ].join("\n"),
    },
  ];
};

/**
 * One row per attempt: `a_level`, how far it got, `a_started` and
 * `a_finished`, and `a_t_k` for each step it did.
 */
const funnelAttemptsCtes = (funnel: FunnelSpec): Cte[] => {
  const n = funnel.steps.length;
  const window = seconds(funnel.window);
  const reachedInOrder = (k: number) => `a_level >= ${k}`;
  const finishedInOrder = `if(a_level = ${n}, r_${n}, NULL)`;

  return match(funnel.ordering)
    .with("loose", () => {
      const hops = hopExclusions(funnel);
      const holds = (k: number) => {
        const disqualifier = k === 2 ? "d2" : `x2_${k}`;
        const clean = hops.has(k)
          ? ` AND (${disqualifier} IS NULL OR ${disqualifier} > r_${k})`
          : "";
        return `(r_${k} IS NOT NULL AND dateDiff('second', r_1, r_${k}) <= ${window}${clean})`;
      };
      return attemptsCtes(funnel, {
        stages: funnelLooseStages(funnel),
        rawTimes: [
          "ts AS r_1",
          ...stepNumbers(funnel, 2).map((k) => `c2_${k} AS r_${k}`),
        ],
        level: levelSql(funnel, holds),
        didStep: reachedInOrder,
        started: "r_1",
        finished: finishedInOrder,
        where: "step_1",
      });
    })
    .with("strict", () =>
      attemptsCtes(funnel, {
        stages: [funnelStrictNextCte(funnel)],
        rawTimes: ["ts AS r_1"],
        level: levelSql(
          funnel,
          (k) => `(s_${k} AND dateDiff('second', r_1, r_${k}) <= ${window})`,
        ),
        didStep: reachedInOrder,
        started: "r_1",
        finished: finishedInOrder,
        where: "step_1",
      }),
    )
    .with("any", () => {
      const done = (k: number) =>
        `(r_${k} IS NOT NULL AND dateDiff('second', ts, r_${k}) <= ${window})`;
      return attemptsCtes(funnel, {
        stages: [funnelAnyFromCte(funnel)],
        rawTimes: stepNumbers(funnel).map((k) => `f_${k} AS r_${k}`),
        level: stepNumbers(funnel)
          .map((k) => `toUInt8${done(k)}`)
          .join(" + "),
        didStep: done,
        started: "ts",
        finished: `if(a_level = ${n}, greatest(${stepNumbers(funnel)
          .map((k) => `r_${k}`)
          .join(", ")}), NULL)`,
        where: null,
      });
    })
    .exhaustive();
};

/**
 * One row per actor, from their best attempt: the one that got furthest,
 * then the first to start. Not the latest: someone who keeps starting and
 * never gets further would then move to their last start, which drains the
 * people who didn't convert out of early periods in "Over time". `level` is how far it got, `started_at` and
 * `finished_at` when it started and finished, and `t_k` when it got to step k.
 */
const funnelRunsCtes = (funnel: FunnelSpec): Cte[] => {
  const steps = stepNumbers(funnel);
  return [
    funnelRowsCte(funnel),
    ...funnelAttemptsCtes(funnel),
    {
      name: "funnel_runs",
      note: "one row per actor, from their attempt that got furthest, then started first",
      deps: ["funnel_attempts"],
      body: [
        "SELECT",
        "  actor,",
        `  argMin((a_level, a_started, a_finished, ${steps.map((k) => `a_t_${k}`).join(", ")}), (-a_level, a_started)) AS run,`,
        "  run.1 AS level,",
        "  run.2 AS started_at,",
        "  run.3 AS finished_at,",
        steps.map((k) => `  run.${k + 3} AS t_${k}`).join(",\n"),
        "FROM funnel_attempts",
        "GROUP BY actor",
      ].join("\n"),
    },
  ];
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
 * who took longer.
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
const reachedStepSql = (step: string): string => `level >= ${step}`;

const CONVERSION_SECONDS_SQL = "dateDiff('second', started_at, finished_at)";

const timeBucketSql = (buckets: TimeToConvertBucket[]): string =>
  `arrayCount(edge -> edge <= ${CONVERSION_SECONDS_SQL}, [${buckets
    .map((timeBucket) => timeBucket.fromSeconds)
    .join(", ")}])`;

/**
 * The median seconds from the previous step, among the actors who reached
 * each step. NULL for the first step and for steps no one reached.
 */
const medianSecondsFromPreviousSql = (funnel: FunnelSpec): string => {
  const hop = `[0, ${stepNumbers(funnel, 2)
    .map((k) => `dateDiff('second', t_${k - 1}, t_${k})`)
    .join(", ")}][step]`;
  const condition = "step > 1 AND level >= step";
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
  // PostHog's first touchpoint: the first value on any of the steps' events.
  const base = scopedEvents(spec, undefined, funnelFlags(funnel), {
    breakoutAnchor: stepNumbers(funnel)
      .map((k) => `step_${k}`)
      .join(" OR "),
  });
  const warnings = [...base.warnings];
  const ctes: Cte[] = [...base.ctes, ...funnelRunsCtes(funnel)];
  let source = "funnel_runs";

  if (spec.breakout !== undefined) {
    ctes.push({
      name: "funnel_broken_out",
      note: "each actor's row once per group they're in",
      deps: [source, ACTOR_BREAKOUTS_CTE],
      body: `SELECT * FROM ${withBreakout(spec, source)}`,
    });
    source = "funnel_broken_out";
  }

  const labels = getFunnelStepLabels(
    funnel.steps.map((step) => step.label),
    funnel.ordering,
  );
  const stepArray = (steps: number[]) =>
    `ARRAY JOIN [${steps.join(", ")}] AS step, [${steps
      .map((step) => lit(labels[step - 1]))
      .join(", ")}] AS label`;

  const view = spec.output.funnelView ?? "steps";
  const people = grainLabel(spec.grain);
  const timeBuckets = getTimeToConvertBuckets(funnel.window);
  const isBrokenOut = spec.breakout !== undefined;
  const finished = reachedStepSql(String(n));
  const orderBy = (...columns: string[]) =>
    `ORDER BY ${[...breakoutOrderBy(spec), ...columns].join(", ")}`;
  let select: string;

  if (view === "overTime" && isBrokenOut) {
    // A line per group, of how many got to the last step: a line per step per
    // group would be one dimension too many.
    select = [
      "SELECT",
      `  ${bucket("started_at", spec.bucket.granularity)} AS period,`,
      `  ${BREAKOUT_COLUMN},`,
      `  round(countIf(${finished}) / nullIf(count(), 0), 4) AS conversion`,
      `FROM ${source}`,
      `GROUP BY period, ${BREAKOUT_COLUMN}`,
      orderBy("period"),
    ].join("\n");
  } else if (view === "overTime") {
    // A line per step after the first, which everyone in a period reached.
    const lineSteps = n > 1 ? stepNumbers(funnel, 2) : [1];
    select = [
      "SELECT",
      `  ${bucket("started_at", spec.bucket.granularity)} AS period,`,
      "  label,",
      `  round(countIf(${reachedStepSql("step")}) / nullIf(count(), 0), 4) AS conversion`,
      `FROM ${source}`,
      stepArray(lineSteps),
      "GROUP BY period, step, label",
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
            `  if(${finished}, ${timeBucketSql(timeBuckets)}, NULL) AS time_bucket`,
            `FROM ${source}`,
          ].join("\n")
        : [
            "SELECT",
            `  ${timeBucketSql(timeBuckets)} AS time_bucket`,
            `FROM ${source}`,
            `WHERE ${finished}`,
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
      "  label,",
      ...breakoutSelect(spec),
      `  countIf(${reachedStepSql("step")}) AS ${people}${isOrdered ? "," : ""}`,
      ...(isOrdered
        ? [
            `  ${medianSecondsFromPreviousSql(funnel)} AS ${MEDIAN_SECONDS_FROM_PREVIOUS_COLUMN}`,
          ]
        : []),
      `FROM ${source}`,
      stepArray(stepNumbers(funnel)),
      `GROUP BY ${breakoutGroupBy(spec)}step, label`,
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
      const step = isBrokenOut ? n : getFunnelStepNumber(labels, point.label);
      const reached =
        step !== null ? ` AND ${reachedStepSql(String(step))}` : "";
      return `${from}\nWHERE ${bucket("started_at", spec.bucket.granularity)} = ${dateTimeLit(period)}${reached}${inGroup}`;
    }
    if (view === "timeToConvert") {
      const label = pointString(point[TIME_TO_CONVERT_COLUMN]);
      const timeBucket = timeBuckets.find(
        (timeBucket) => timeBucket.label === label,
      );
      return timeBucket === undefined
        ? null
        : `${from}\nWHERE ${finished} AND ${timeBucketSql(timeBuckets)} = ${timeBucket.index}${inGroup}`;
    }
    const step = getFunnelStepNumber(labels, point.label);
    if (step === null) {
      return null;
    }
    // Dropped off before a step: got to the one before it but not to it.
    if (point[DROPPED_OFF_POINT_KEY] === true && step > 1) {
      return `${from}\nWHERE ${reachedStepSql(String(step - 1))} AND NOT (${reachedStepSql(String(step))})${inGroup}`;
    }
    return `${from}\nWHERE ${reachedStepSql(String(step))}${inGroup}`;
  };

  return { ctes, select, warnings, members };
};
