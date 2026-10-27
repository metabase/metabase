import type { AnalysisSpec, HabitSpec } from "../../spec/types";
import {
  AVG_EVENTS_COLUMN,
  AVG_SESSIONS_COLUMN,
} from "../../sql/analyses/base";
import { grainLabel } from "../../sql/compile/grain";
import { aggregation, asc, bucketed, clause, field } from "../clause";
import { NotPortedError, type Query, StageList, stage } from "../query";

import {
  type MbqlBase,
  SCOPED_EVENTS,
  baseStages,
  col,
  roleExpr,
  scopedEvents,
} from "./base";
import { withBreakout } from "./breakout";

const ACTIVE_PERIODS = "active_periods";

const histogram = (
  spec: AnalysisSpec,
  habit: HabitSpec,
  base: MbqlBase,
): Query => {
  const scoped = scopedEvents(spec, base, {
    match: habit.active,
    extraColumns: [
      {
        name: "session",
        expr: roleExpr(base, "session"),
        baseType: base.columnTypes.session,
      },
    ],
  });
  // Every use of a column is a clause of its own, with its own uuid.
  const groups = withBreakout(spec, scoped.actor);
  const periods = () => field("periods", "type/Integer");
  const events = () => field("events", "type/Integer");
  const sessions = () => field("sessions", "type/Integer");

  return new StageList()
    .add(...baseStages(base), ...scoped.stages)
    .add(
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
      stage("habit", undefined, {
        joins: groups.joins,
        expressions: groups.expressions,
        breakout: [...groups.breakout(), periods()],
        aggregation: [
          aggregation(grainLabel(spec.grain), clause("count")),
          aggregation(
            AVG_EVENTS_COLUMN,
            clause("/", clause("sum", events()), clause("sum", periods())),
          ),
          aggregation(
            AVG_SESSIONS_COLUMN,
            clause("/", clause("sum", sessions()), clause("sum", periods())),
          ),
        ],
        "order-by": [asc(periods())],
      }),
    )
    .toQuery(base.database);
};

export const buildHabitQuery = (spec: AnalysisSpec, base: MbqlBase): Query => {
  const habit = spec.habit;
  if (habit === undefined) {
    throw new Error("A habit analysis needs habit settings");
  }
  if (habit.measure === "ratio" || habit.percent) {
    throw new NotPortedError("These habit settings aren't ported to MBQL yet");
  }
  return histogram(spec, habit, base);
};
