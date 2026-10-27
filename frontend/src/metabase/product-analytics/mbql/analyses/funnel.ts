import type { AnalysisSpec, FunnelSpec } from "../../spec/types";
import { BREAKOUT_COLUMN } from "../../sql/analyses/breakout";
import { seconds } from "../../sql/compile/actorPredicate";
import {
  type Clause,
  type Frame,
  aggregation,
  asc,
  bucketed,
  caseWhen,
  clause,
  desc,
  eq,
  expression,
  expressionRef,
  field,
  round4,
  value,
  window,
} from "../clause";
import {
  type MbqlStage,
  NotPortedError,
  type Query,
  StageList,
  stage,
} from "../query";

import {
  type MbqlBase,
  SCOPED_EVENTS,
  type ScopedEvents,
  baseStages,
  col,
  scopedEvents,
} from "./base";
import { withBreakout } from "./breakout";

const integer = (name: string) => field(name, "type/Integer");
const datetime = (name: string) => field(name, "type/DateTime");
const isSet = (name: string) => eq(integer(name), 1);

const stepNumbers = (funnel: FunnelSpec, from = 1): number[] =>
  funnel.steps.map((_, index) => index + 1).filter((step) => step >= from);

/** The disqualifiers a funnel reads: only in order with other actions allowed. */
const getExclusions = (funnel: FunnelSpec) =>
  funnel.ordering === "loose" ? funnel.exclusions : [];

const exclusionColumns = (funnel: FunnelSpec) =>
  getExclusions(funnel).map((_, index) => `excl_${index + 1}`);

/**
 * For each hop k, from step k - 1 to step k, the disqualifiers between steps
 * that span it. Steps past the last one count as the last one.
 */
const hopExclusions = (funnel: FunnelSpec): Map<number, string[]> => {
  const lastStep = funnel.steps.length;
  const ranges = getExclusions(funnel).map((exclusion, index) => ({
    column: `excl_${index + 1}`,
    from: Math.min(exclusion.fromStep + 1, lastStep),
    to: Math.min(exclusion.toStep + 1, lastStep),
  }));
  return new Map(
    stepNumbers(funnel, 2)
      .map((hop): [number, string[]] => [
        hop,
        ranges
          .filter(({ from, to }) => from < hop && hop <= to)
          .map(({ column }) => column),
      ])
      .filter(([, columns]) => columns.length > 0),
  );
};

const anyOf = (columns: string[]): Clause => {
  const [first, ...rest] = columns.map(isSet);
  if (first === undefined) {
    throw new Error("anyOf needs at least one column");
  }
  return rest.length === 0 ? first : clause("or", first, ...rest);
};

const allOf = (conditions: Clause[]): Clause => {
  const [first, ...rest] = conditions;
  if (first === undefined) {
    throw new Error("allOf needs at least one condition");
  }
  return rest.length === 0 ? first : clause("and", first, ...rest);
};

/** The largest of `exprs`, none of which is NULL where it's read. */
const greatest = (exprs: (() => Clause)[]): Clause => {
  const [only, ...others] = exprs;
  if (only === undefined) {
    throw new Error("greatest needs at least one expression");
  }
  if (others.length === 0) {
    return only();
  }
  const branches = exprs
    .slice(0, -1)
    .map((candidate, index): readonly [Clause, Clause] => [
      allOf(
        exprs
          .filter((_, other) => other !== index)
          .map((other) => clause(">=", candidate(), other())),
      ),
      candidate(),
    ]);
  const last = exprs[exprs.length - 1];
  return caseWhen(branches, last());
};

const secondsBetween = (from: Clause, to: Clause): Clause =>
  clause("datetime-diff", from, to, "second");

/**
 * Each attempt's level, start and finish, and when it did each step, as the
 * expressions `a_level`, `a_started`, `a_finished` and `a_t_k`. `level` reads
 * the attempt's raw step times `r_k`.
 */
type Attempt = {
  stages: MbqlStage[];
  rawTimes: { k: number; expr: () => Clause }[];
  level: () => Clause;
  didStep: (k: number) => Clause;
  started: () => Clause;
  finished: () => Clause;
  filters: Clause[];
};

/** An attempt's time of step k, an expression of the attempts stage itself. */
const rawTime = (k: number) => expressionRef(`r_${k}`, "type/DateTime");

/** The largest k whose hops 2..k all hold, or 1. */
const ladder = (funnel: FunnelSpec, holds: (hop: number) => Clause): Clause => {
  const hops = stepNumbers(funnel, 2);
  if (hops.length === 0) {
    return value(1, "type/Integer");
  }
  return caseWhen(
    [...hops]
      .reverse()
      .map((k): readonly [Clause, Clause] => [
        allOf(hops.filter((hop) => hop <= k).map(holds)),
        value(k, "type/Integer"),
      ]),
    value(1, "type/Integer"),
  );
};

const levelRef = () => expressionRef("a_level", "type/Integer");

/** In order: did the attempt get as far as step k. */
const reachedInOrder = (k: number) => clause(">=", levelRef(), k);

/**
 * In order, the run from each step-1 row takes the first step-2 row after it,
 * then the first step-3 row after that, and so on. Built from the last step
 * back, `c{j}_{k}` is when that run reaches step k if it starts looking for
 * step j after the row: the minimum over every step-j row after it. `x{j}_{k}`
 * carries, the same way, the first disqualifier for hop k after the run's step
 * k - 1, from the next disqualifiers `d{k}`.
 */
const looseAttempt = (
  funnel: FunnelSpec,
  actor: () => Clause,
  windowSeconds: number,
): Attempt => {
  const n = funnel.steps.length;
  const hops = hopExclusions(funnel);
  // Every later row, as a frame that only grows, so each row costs O(1).
  const after = (): {
    partitionBy: Clause[];
    orderBy: Clause[];
    frame: Frame;
  } => ({
    partitionBy: [actor()],
    orderBy: [desc(integer("rn"))],
    frame: {
      mode: "rows",
      start: "unbounded-preceding",
      end: ["preceding", 1],
    },
  });
  const minAfter = (condition: Clause, of: Clause) =>
    window(clause("min", caseWhen([[condition, of]])), after());

  const stages = stepNumbers(funnel, 2)
    .reverse()
    .map((j) => {
      const later = stepNumbers(funnel, j + 1);
      return stage(`funnel_from_step_${j}`, undefined, {
        expressions: [
          expression(
            `c${j}_${j}`,
            minAfter(isSet(`step_${j}`), datetime("ts")),
          ),
          ...later.map((k) =>
            expression(
              `c${j}_${k}`,
              minAfter(isSet(`step_${j}`), datetime(`c${j + 1}_${k}`)),
            ),
          ),
          ...later
            .filter((k) => hops.has(k))
            .map((k) =>
              expression(
                `x${j}_${k}`,
                minAfter(
                  isSet(`step_${j}`),
                  datetime(k === j + 1 ? `d${k}` : `x${j + 1}_${k}`),
                ),
              ),
            ),
          ...(j === n
            ? [...hops].map(([hop, columns]) =>
                expression(`d${hop}`, minAfter(anyOf(columns), datetime("ts"))),
              )
            : []),
        ],
      });
    });

  const holds = (k: number) => {
    const disqualifier = () => datetime(k === 2 ? "d2" : `x2_${k}`);
    return allOf([
      clause("not-null", rawTime(k)),
      clause("<=", secondsBetween(rawTime(1), rawTime(k)), windowSeconds),
      ...(hops.has(k)
        ? [
            clause(
              "or",
              clause("is-null", disqualifier()),
              clause(">", disqualifier(), rawTime(k)),
            ),
          ]
        : []),
    ]);
  };

  return {
    stages,
    rawTimes: [
      { k: 1, expr: () => datetime("ts") },
      ...stepNumbers(funnel, 2).map((k) => ({
        k,
        expr: () => datetime(`c2_${k}`),
      })),
    ],
    level: () => ladder(funnel, holds),
    didStep: reachedInOrder,
    started: () => rawTime(1),
    finished: () => caseWhen([[eq(levelRef(), n), rawTime(n)]]),
    filters: [isSet("step_1")],
  };
};

/** In strict order, the run from each row is the rows right after it. */
const strictAttempt = (
  funnel: FunnelSpec,
  actor: () => Clause,
  windowSeconds: number,
): Attempt => {
  const n = funnel.steps.length;
  const byRow = () => ({
    partitionBy: [actor()],
    orderBy: [asc(integer("rn"))],
  });
  return {
    stages: [
      stage("funnel_next", undefined, {
        expressions: stepNumbers(funnel, 2).flatMap((k) => [
          expression(
            `n_${k}`,
            window(clause("lead", datetime("ts"), k - 1), byRow()),
          ),
          expression(
            `s_${k}`,
            window(clause("lead", integer(`step_${k}`), k - 1), byRow()),
          ),
        ]),
      }),
    ],
    rawTimes: [
      { k: 1, expr: () => datetime("ts") },
      ...stepNumbers(funnel, 2).map((k) => ({
        k,
        expr: () => datetime(`n_${k}`),
      })),
    ],
    level: () =>
      ladder(funnel, (k) =>
        allOf([
          isSet(`s_${k}`),
          clause("<=", secondsBetween(rawTime(1), rawTime(k)), windowSeconds),
        ]),
      ),
    didStep: reachedInOrder,
    started: () => rawTime(1),
    finished: () => caseWhen([[eq(levelRef(), n), rawTime(n)]]),
    filters: [isSet("step_1")],
  };
};

/**
 * In any order, the first time of each step from each row on. A row's level
 * is how many steps it saw within the window.
 */
const anyAttempt = (
  funnel: FunnelSpec,
  actor: () => Clause,
  windowSeconds: number,
): Attempt => {
  const n = funnel.steps.length;
  // This row and every later one, as a frame that only grows.
  const fromHere = () => ({
    partitionBy: [actor()],
    orderBy: [desc(integer("rn"))],
    frame: {
      mode: "rows" as const,
      start: "unbounded-preceding" as const,
      end: "current-row" as const,
    },
  });
  const done = (k: number) =>
    allOf([
      clause("not-null", rawTime(k)),
      clause("<=", secondsBetween(datetime("ts"), rawTime(k)), windowSeconds),
    ]);
  const steps = stepNumbers(funnel);
  return {
    stages: [
      stage("funnel_from", undefined, {
        expressions: steps.map((k) =>
          expression(
            `f_${k}`,
            window(
              clause("min", caseWhen([[isSet(`step_${k}`), datetime("ts")]])),
              fromHere(),
            ),
          ),
        ),
      }),
    ],
    rawTimes: steps.map((k) => ({ k, expr: () => datetime(`f_${k}`) })),
    level: () =>
      steps
        .map((k) => caseWhen([[done(k), 1]], 0))
        .reduce((sum, term) => clause("+", sum, term)),
    didStep: done,
    started: () => datetime("ts"),
    finished: () =>
      caseWhen([
        [eq(levelRef(), n), greatest(steps.map((k) => () => rawTime(k)))],
      ]),
    filters: [],
  };
};

/**
 * `funnel_runs`: one row per actor, from their best attempt, the one that got
 * furthest and then started first, as `level`, `started_at`, `finished_at`
 * and `t_k` when it got to step k.
 */
const runStages = (
  spec: AnalysisSpec,
  funnel: FunnelSpec,
  scoped: ScopedEvents,
): MbqlStage[] => {
  const actor = () => col(scoped.actor);
  const steps = stepNumbers(funnel);
  const excls = exclusionColumns(funnel);
  const isStrict = funnel.ordering === "strict";
  const windowSeconds = seconds(funnel.window);
  const attempt = {
    loose: looseAttempt,
    strict: strictAttempt,
    any: anyAttempt,
  }[funnel.ordering](funnel, actor, windowSeconds);

  // At the same time: disqualifiers, then the steps in order, then anything else.
  const tieOrder = caseWhen(
    [
      ...(excls.length > 0 ? [[anyOf(excls), 0] as const] : []),
      ...steps.map((k): readonly [Clause, number] => [isSet(`step_${k}`), k]),
    ],
    steps.length + 1,
  );

  return [
    stage("funnel_rows", SCOPED_EVENTS, {
      ...(isStrict
        ? {}
        : { filters: [anyOf([...steps.map((k) => `step_${k}`), ...excls])] }),
      expressions: [
        expression(
          "rn",
          window(clause("row-number"), {
            partitionBy: [actor()],
            orderBy: [asc(datetime("ts")), asc(tieOrder)],
          }),
        ),
      ],
    }),
    ...attempt.stages,
    stage("funnel_attempts", undefined, {
      filters: attempt.filters,
      expressions: [
        ...attempt.rawTimes.map(({ k, expr }) => expression(`r_${k}`, expr())),
        expression("a_level", attempt.level()),
        expression("a_started", attempt.started()),
        expression("a_finished", attempt.finished()),
        ...steps.map((k) =>
          expression(`a_t_${k}`, caseWhen([[attempt.didStep(k), rawTime(k)]])),
        ),
      ],
    }),
    stage("funnel_attempt_ranks", undefined, {
      expressions: [
        expression(
          "pick",
          window(clause("row-number"), {
            partitionBy: [actor()],
            orderBy: [
              desc(integer("a_level")),
              asc(datetime("a_started")),
              asc(integer("rn")),
            ],
          }),
        ),
      ],
    }),
    stage("funnel_runs", undefined, {
      filters: [isSet("pick")],
      expressions: [
        expression("level", integer("a_level")),
        expression("started_at", datetime("a_started")),
        expression("finished_at", datetime("a_finished")),
        ...steps.map((k) => expression(`t_${k}`, datetime(`a_t_${k}`))),
      ],
      fields: [
        actor(),
        expressionRef("level", "type/Integer"),
        expressionRef("started_at", "type/DateTime"),
        expressionRef("finished_at", "type/DateTime"),
        ...steps.map((k) => expressionRef(`t_${k}`, "type/DateTime")),
      ],
    }),
  ];
};

export const buildFunnelQuery = (spec: AnalysisSpec, base: MbqlBase): Query => {
  const funnel = spec.funnel;
  if (funnel === undefined || funnel.steps.length === 0) {
    throw new NotPortedError("A funnel without steps has no MBQL query");
  }
  const steps = stepNumbers(funnel);
  const n = funnel.steps.length;
  const scoped = scopedEvents(spec, base, {
    extraColumns: [
      ...funnel.steps.map((step, index) => ({
        name: `step_${index + 1}`,
        expr: field(step.flag, "type/Integer"),
        baseType: "type/Integer" as const,
      })),
      ...getExclusions(funnel).map((exclusion, index) => ({
        name: `excl_${index + 1}`,
        expr: field(exclusion.flag, "type/Integer"),
        baseType: "type/Integer" as const,
      })),
    ],
    // PostHog's first touchpoint: the first value on any of the steps' events.
    breakoutAnchor: () => anyOf(steps.map((k) => `step_${k}`)),
  });
  const stages = new StageList()
    .add(...baseStages(base), ...scoped.stages)
    .add(...runStages(spec, funnel, scoped));
  const view = spec.output.funnelView ?? "steps";
  const groups = withBreakout(spec, scoped.actor);

  if (view === "overTime" && spec.breakout !== undefined) {
    // A line per group, of how many got to the last step.
    return stages
      .add(
        stage("funnel_conversion", "funnel_runs", {
          joins: groups.joins,
          expressions: groups.expressions,
          breakout: [
            bucketed("started_at", spec.bucket.granularity),
            ...groups.breakout(),
          ],
          aggregation: [
            aggregation(
              "conversion",
              round4(
                clause(
                  "/",
                  clause("count-where", clause(">=", integer("level"), n)),
                  clause("count"),
                ),
              ),
            ),
          ],
        }),
        stage("funnel", undefined, {
          expressions: [expression("period", datetime("started_at"))],
          fields: [
            expressionRef("period", "type/DateTime"),
            field(BREAKOUT_COLUMN, "type/Text"),
            field("conversion", "type/Float"),
          ],
          "order-by": [asc(expressionRef("period", "type/DateTime"))],
        }),
      )
      .toQuery(base.database);
  }
  throw new NotPortedError(
    `The funnel's ${view} view isn't ported to MBQL yet`,
  );
};
