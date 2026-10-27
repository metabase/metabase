import type { AnalysisSpec, HabitSpec } from "../../spec/types";
import {
  AVG_EVENTS_COLUMN,
  AVG_SESSIONS_COLUMN,
} from "../../sql/analyses/base";
import { BREAKOUT_COLUMN } from "../../sql/analyses/breakout";
import { activeColumn } from "../../sql/analyses/habit";
import {
  IN_RANGE_FLAG,
  MONTHLY_ACTIVE_PERIODS,
} from "../../sql/analyses/lookback";
import { grainLabel } from "../../sql/compile/grain";
import {
  type BaseType,
  type Clause,
  aggregation,
  asc,
  bucketed,
  clause,
  eq,
  expression,
  expressionRef,
  field,
  round4,
  window,
} from "../clause";
import { type Query, StageList, joinStage, stage } from "../query";

import {
  type MbqlBase,
  SCOPED_EVENTS,
  type ScopedEvents,
  baseStages,
  col,
  flagIsSet,
  roleExpr,
  scopedEvents,
} from "./base";
import { withBreakout } from "./breakout";

const ACTIVE_PERIODS = "active_periods";

const integer = (name: string, joinAlias?: string) =>
  field(name, "type/Integer", joinAlias);

/** The breakout column first, when there is one, for a stage's fields. */
const breakoutFields = (spec: AnalysisSpec): Clause[] =>
  spec.breakout !== undefined ? [field(BREAKOUT_COLUMN, "type/Text")] : [];

const scopedFor = (
  spec: AnalysisSpec,
  habit: HabitSpec,
  base: MbqlBase,
): ScopedEvents =>
  scopedEvents(spec, base, {
    match: habit.active,
    extraColumns: [
      {
        name: "session",
        expr: roleExpr(base, "session"),
        baseType: base.columnTypes.session,
      },
    ],
  });

/**
 * How many distinct sub-periods each actor was active in: the people per
 * count, and their events and sessions per active sub-period. With `percent`,
 * each count's share of its group's people.
 */
const histogram = (
  spec: AnalysisSpec,
  habit: HabitSpec,
  base: MbqlBase,
): Query => {
  const scoped = scopedFor(spec, habit, base);
  const groups = withBreakout(spec, scoped.actor);
  const people = grainLabel(spec.grain);
  const periods = () => integer("periods");
  const summary = [
    aggregation(
      AVG_EVENTS_COLUMN,
      clause("/", clause("sum", integer("events")), clause("sum", periods())),
    ),
    aggregation(
      AVG_SESSIONS_COLUMN,
      clause("/", clause("sum", integer("sessions")), clause("sum", periods())),
    ),
  ];

  const stages = new StageList().add(...baseStages(base), ...scoped.stages).add(
    stage(ACTIVE_PERIODS, SCOPED_EVENTS, {
      breakout: [col(scoped.actor)],
      aggregation: [
        aggregation(
          "periods",
          clause("distinct", bucketed(scoped.ts.name, habit.subPeriod)),
        ),
        aggregation("events", clause("count")),
        aggregation(
          "sessions",
          clause("distinct", field("session", base.columnTypes.session)),
        ),
      ],
    }),
  );

  if (!habit.percent) {
    return stages
      .add(
        stage("habit", undefined, {
          joins: groups.joins,
          expressions: groups.expressions,
          breakout: [...groups.breakout(), periods()],
          aggregation: [aggregation(people, clause("count")), ...summary],
          "order-by": [asc(periods())],
        }),
      )
      .toQuery(base.database);
  }

  // Shares are of each group's people, so groups of different sizes compare.
  return stages
    .add(
      stage("habit_counts", undefined, {
        joins: groups.joins,
        expressions: groups.expressions,
        breakout: [...groups.breakout(), periods()],
        aggregation: [aggregation("actors", clause("count")), ...summary],
      }),
      stage("habit", undefined, {
        // The window is an expression of its own: the legacy form drivers
        // still receive (D18) only takes a window as a whole expression.
        expressions: [
          expression(
            "group_actors",
            window(clause("sum", integer("actors")), {
              partitionBy: breakoutFields(spec),
            }),
          ),
          expression(
            people,
            round4(
              clause(
                "/",
                integer("actors"),
                expressionRef("group_actors", "type/Integer"),
              ),
            ),
          ),
        ],
        fields: [
          ...breakoutFields(spec),
          periods(),
          expressionRef(people, "type/Float"),
          field(AVG_EVENTS_COLUMN, "type/Float"),
          field(AVG_SESSIONS_COLUMN, "type/Float"),
        ],
        "order-by": [...breakoutFields(spec).map(asc), asc(periods())],
      }),
    )
    .toQuery(base.database);
};

/**
 * Actives per sub-period over actives in the trailing month: 30 days, or 4
 * weeks. The month reaches back before the date range, through the lookback.
 * Each sub-period with anyone active in the range is a row, and reads the
 * actor periods in the month that ends with it.
 */
const ratio = (spec: AnalysisSpec, habit: HabitSpec, base: MbqlBase): Query => {
  const unit = habit.subPeriod;
  const windowPeriods = MONTHLY_ACTIVE_PERIODS[unit];
  const active = activeColumn(unit);
  const scoped = scopedFor(spec, habit, base);
  const ts = (alias?: string) => field(scoped.ts.name, "type/DateTime", alias);
  const groups = withBreakout(spec, scoped.actor, "a");
  const activeThen = () =>
    clause("and", eq(ts("a"), ts()), eq(integer(IN_RANGE_FLAG, "a"), 1));
  const actor = () => col(scoped.actor, "a");
  const float = (name: string, baseType: BaseType = "type/Float") =>
    field(name, baseType);

  return new StageList()
    .add(...baseStages(base), ...scoped.stages)
    .add(
      stage("actor_periods", SCOPED_EVENTS, {
        breakout: [col(scoped.actor), bucketed(scoped.ts.name, unit)],
        aggregation: [
          aggregation(IN_RANGE_FLAG, clause("max", integer(IN_RANGE_FLAG))),
          aggregation("events", clause("count")),
          aggregation(
            "sessions",
            clause("distinct", field("session", base.columnTypes.session)),
          ),
        ],
      }),
      stage("range_periods", undefined, {
        filters: [flagIsSet(IN_RANGE_FLAG)],
        breakout: [ts()],
      }),
      stage("period_actives", undefined, {
        joins: [
          joinStage(
            "actor_periods",
            "a",
            [
              clause("<=", ts("a"), ts()),
              clause(
                ">",
                ts("a"),
                clause("datetime-subtract", ts(), windowPeriods, unit),
              ),
            ],
            { strategy: "inner-join" },
          ),
          ...groups.joins,
        ],
        expressions: groups.expressions,
        breakout: [...groups.breakout(), ts()],
        aggregation: [
          aggregation(active, clause("distinct-where", actor(), activeThen())),
          aggregation("mau", clause("distinct", actor())),
          aggregation(
            AVG_EVENTS_COLUMN,
            clause(
              "/",
              clause("sum-where", integer("events", "a"), activeThen()),
              clause("distinct-where", actor(), activeThen()),
            ),
          ),
          aggregation(
            AVG_SESSIONS_COLUMN,
            clause(
              "/",
              clause("sum-where", integer("sessions", "a"), activeThen()),
              clause("distinct-where", actor(), activeThen()),
            ),
          ),
        ],
      }),
      stage("habit", undefined, {
        filters: [clause(">", integer(active), 0)],
        expressions: [
          expression(unit, ts()),
          expression(
            "ratio",
            round4(clause("/", integer(active), integer("mau"))),
          ),
        ],
        fields: [
          ...breakoutFields(spec),
          expressionRef(unit, "type/DateTime"),
          integer(active),
          integer("mau"),
          expressionRef("ratio", "type/Float"),
          float(AVG_EVENTS_COLUMN),
          float(AVG_SESSIONS_COLUMN),
        ],
        "order-by": [
          ...breakoutFields(spec).map(asc),
          asc(expressionRef(unit, "type/DateTime")),
        ],
      }),
    )
    .toQuery(base.database);
};

export const buildHabitQuery = (spec: AnalysisSpec, base: MbqlBase): Query => {
  const habit = spec.habit;
  if (habit === undefined) {
    throw new Error("A habit analysis needs habit settings");
  }
  return habit.measure === "ratio"
    ? ratio(spec, habit, base)
    : histogram(spec, habit, base);
};
