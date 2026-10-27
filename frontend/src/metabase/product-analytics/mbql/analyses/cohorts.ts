import type { AnalysisSpec, CohortsSpec, Period } from "../../spec/types";
import {
  AVG_EVENTS_COLUMN,
  AVG_SESSIONS_COLUMN,
} from "../../sql/analyses/base";
import { BREAKOUT_COLUMN } from "../../sql/analyses/breakout";
import { toCohortPeriod } from "../../sql/analyses/cohorts";
import {
  type Clause,
  aggregation,
  asc,
  bucketed,
  clause,
  eq,
  expression,
  expressionRef,
  field,
  value,
} from "../clause";
import { type Query, StageList, joinStage, stage } from "../query";

import {
  type MbqlBase,
  SCOPED_EVENTS,
  baseStages,
  col,
  flagIsSet,
  roleExpr,
  scopedEvents,
} from "./base";
import { withBreakout } from "./breakout";

const offsetBetween = (
  started: Clause,
  later: Clause,
  period: Period,
): Clause => clause("datetime-diff", started, later, period);

/** `x` rounded to 4 decimal places, as the string planners round shares. */
const round4 = (x: Clause): Clause =>
  clause("/", clause("round", clause("*", x, 10000)), 10000);

const cohortsQuery = (
  spec: AnalysisSpec,
  cohorts: CohortsSpec,
  base: MbqlBase,
): Query => {
  const period = toCohortPeriod(spec.bucket.granularity);
  const flagOrOne = (flag: string | undefined): Clause =>
    flag !== undefined ? field(flag, "type/Integer") : value(1, "type/Integer");
  const scoped = scopedEvents(spec, base, {
    extraColumns: [
      {
        name: "is_start",
        expr: flagOrOne(cohorts.start?.flag),
        baseType: "type/Integer",
      },
      {
        name: "is_return",
        expr: flagOrOne(cohorts.return?.flag),
        baseType: "type/Integer",
      },
      {
        name: "session",
        expr: roleExpr(base, "session"),
        baseType: base.columnTypes.session,
      },
    ],
    // A property's value comes from the start events: a later value would
    // favor the people who stayed long enough to change it.
    breakoutAnchor: () => flagIsSet("is_start"),
  });
  const isGrouped = spec.breakout !== undefined;
  const groups = withBreakout(spec, scoped.actor);
  const actor = () => col(scoped.actor);
  const actorIn = (alias: string) => col(scoped.actor, alias);
  const startTs = (alias?: string) => field("start_ts", "type/DateTime", alias);
  const offset = (alias?: string) => field("offset", "type/Integer", alias);
  const events = () => field("events", "type/Integer", "r");
  const cameBack = () => clause("not-null", events());
  const matched = (): Clause =>
    cohorts.returnRule === "exactly"
      ? cameBack()
      : clause(">=", field("furthest", "type/Integer", "f"), offset());
  const isAverage = !isGrouped && spec.output.cohortsLines === "average";
  const showsDate = !isGrouped && !isAverage;
  const cohortType = isGrouped ? "type/Text" : "type/DateTime";
  const percent = spec.output.cohortsDisplay !== "counts";

  const cohortSize = () => clause("distinct", actor());
  const returned = () => clause("distinct-where", actor(), matched());

  return new StageList()
    .add(...baseStages(base), ...scoped.stages)
    .add(
      stage("first_starts", SCOPED_EVENTS, {
        filters: [eq(field("is_start", "type/Integer"), 1)],
        breakout: [actor()],
        aggregation: [aggregation("start_ts", clause("min", col(scoped.ts)))],
      }),
      // Each actor in the period they started in, which is their cohort, or
      // in each group they're in.
      stage("starts", undefined, {
        joins: groups.joins,
        expressions: groups.expressions,
        breakout: [actor(), ...groups.breakout(), bucketed("start_ts", period)],
      }),
      // The periods the chart can show: those with any event in scope.
      stage("event_periods", SCOPED_EVENTS, {
        breakout: [bucketed(scoped.ts.name, period)],
      }),
      // Keyed by actor, not cohort: an actor in several groups returned once.
      stage("returns", SCOPED_EVENTS, {
        joins: [
          joinStage("first_starts", "s", [eq(actor(), actorIn("s"))], {
            strategy: "inner-join",
            fields: [],
          }),
        ],
        filters: [flagIsSet("is_return")],
        expressions: [
          expression(
            "offset",
            offsetBetween(
              bucketed("start_ts", period, "s"),
              bucketed(scoped.ts.name, period),
              period,
            ),
          ),
        ],
        breakout: [actor(), expressionRef("offset", "type/Integer")],
        aggregation: [
          aggregation("events", clause("count")),
          aggregation(
            "sessions",
            clause("distinct", field("session", base.columnTypes.session)),
          ),
        ],
      }),
      stage("furthest", undefined, {
        breakout: [actor()],
        aggregation: [aggregation("furthest", clause("max", offset()))],
      }),
      // Each actor once per period from their start to the last one shown.
      stage("cells", "starts", {
        joins: [
          joinStage(
            "event_periods",
            "p",
            [
              clause(
                ">=",
                field(scoped.ts.name, "type/DateTime", "p"),
                startTs(),
              ),
            ],
            { strategy: "inner-join", fields: [] },
          ),
        ],
        expressions: [
          expression(
            "cohort",
            isGrouped ? field(BREAKOUT_COLUMN, "type/Text") : startTs(),
          ),
          expression("date", field(scoped.ts.name, "type/DateTime", "p")),
          expression(
            "offset",
            offsetBetween(
              startTs(),
              field(scoped.ts.name, "type/DateTime", "p"),
              period,
            ),
          ),
        ],
      }),
      stage("cohorts", undefined, {
        joins: [
          joinStage(
            "returns",
            "r",
            [
              clause(
                "and",
                eq(actor(), actorIn("r")),
                eq(offset(), offset("r")),
              ),
            ],
            {
              fields: [
                field("events", "type/Integer", "r"),
                field("sessions", "type/Integer", "r"),
              ],
            },
          ),
          joinStage("furthest", "f", [eq(actor(), actorIn("f"))], {
            fields: [field("furthest", "type/Integer", "f")],
          }),
        ],
        breakout: [
          ...(isAverage ? [] : [field("cohort", cohortType)]),
          offset(),
          ...(showsDate ? [field("date", "type/DateTime")] : []),
        ],
        aggregation: [
          aggregation("cohort_size", cohortSize()),
          aggregation(
            "value",
            percent
              ? round4(clause("/", returned(), cohortSize()))
              : returned(),
          ),
          aggregation(
            AVG_EVENTS_COLUMN,
            clause(
              "/",
              clause("sum", events()),
              clause("count-where", cameBack()),
            ),
          ),
          aggregation(
            AVG_SESSIONS_COLUMN,
            clause(
              "/",
              clause("sum", field("sessions", "type/Integer", "r")),
              clause("count-where", cameBack()),
            ),
          ),
        ],
        "order-by": [
          ...(isAverage ? [] : [asc(field("cohort", cohortType))]),
          asc(offset()),
        ],
      }),
    )
    .toQuery(base.database);
};

export const buildCohortsQuery = (
  spec: AnalysisSpec,
  base: MbqlBase,
): Query => {
  const cohorts = spec.cohorts;
  if (cohorts === undefined) {
    throw new Error("A cohorts analysis needs cohorts settings");
  }
  return cohortsQuery(spec, cohorts, base);
};
