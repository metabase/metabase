import type { AnalysisSpec, BreakoutSpec } from "../../spec/types";
import {
  ACTOR_BREAKOUTS_CTE,
  BREAKOUT_COLUMN,
  BREAKOUT_PROPERTY_COLUMN,
  BREAKOUT_VALUE_COLUMN,
} from "../../sql/analyses/breakout";
import {
  type BaseType,
  type Clause,
  aggregation,
  clause,
  eq,
  expression,
  expressionRef,
  field,
  value,
} from "../clause";
import { type Join, type MbqlStage, joinStage, stage } from "../query";

import { type Column, SCOPED_EVENTS, col } from "./common";

/** The join alias aggregating stages read each actor's group through. */
const BREAKOUT_JOIN = "breakout_group";

/** The columns `scoped_events` carries for the breakout. */
export const breakoutEventColumns = (
  breakout: BreakoutSpec | undefined,
  segmentFlags: readonly string[],
): { name: string; expr: Clause; baseType: BaseType }[] => {
  switch (breakout?.type) {
    case undefined:
      return [];
    case "property":
      return [
        {
          name: BREAKOUT_VALUE_COLUMN,
          expr: clause(
            "coalesce",
            field(BREAKOUT_PROPERTY_COLUMN, "type/Text"),
            "",
          ),
          baseType: "type/Text",
        },
      ];
    case "segments":
      return segmentFlags.map((flag) => ({
        name: flag,
        expr: field(flag, "type/Integer"),
        baseType: "type/Integer",
      }));
  }
};

/**
 * `actor_breakouts`: a row per actor per group they're in, as `actor` and
 * `breakout`. A property puts each actor in one group, their value at their
 * first touchpoint among the events `anchor` picks, or the empty group. Each
 * segment group is a stage of its own, appended into one.
 */
export const actorBreakoutStages = (
  breakout: BreakoutSpec,
  actor: Column,
  ts: Column,
  anchor?: () => Clause,
): MbqlStage[] => {
  const value_ = () => field(BREAKOUT_VALUE_COLUMN, "type/Text");
  const touchpoints = () => [
    clause("!=", value_(), ""),
    ...(anchor !== undefined ? [anchor()] : []),
  ];
  switch (breakout.type) {
    case "property":
      return [
        stage("breakout_first_ts", SCOPED_EVENTS, {
          filters: touchpoints(),
          breakout: [col(actor)],
          aggregation: [aggregation("first_ts", clause("min", col(ts)))],
        }),
        stage("breakout_values", SCOPED_EVENTS, {
          joins: [
            joinStage(
              "breakout_first_ts",
              "f",
              [
                eq(col(actor), col(actor, "f")),
                eq(col(ts), field("first_ts", ts.baseType, "f")),
              ],
              { strategy: "inner-join" },
            ),
          ],
          filters: touchpoints(),
          breakout: [col(actor)],
          aggregation: [aggregation(BREAKOUT_COLUMN, clause("min", value_()))],
        }),
        stage(ACTOR_BREAKOUTS_CTE, SCOPED_EVENTS, {
          joins: [
            joinStage("breakout_values", "v", [
              eq(col(actor), col(actor, "v")),
            ]),
          ],
          expressions: [
            expression(
              BREAKOUT_COLUMN,
              clause("coalesce", field(BREAKOUT_COLUMN, "type/Text", "v"), ""),
            ),
          ],
          breakout: [col(actor), expressionRef(BREAKOUT_COLUMN, "type/Text")],
        }),
      ];
    case "segments": {
      const names = breakout.groups.map(
        (_, index) => `breakout_group_${index}`,
      );
      const groups = breakout.groups.map(({ label, segment }, index) =>
        stage(`breakout_group_${index}`, SCOPED_EVENTS, {
          ...(segment !== undefined
            ? {
                filters: [
                  eq(
                    field(segment.flag, "type/Integer"),
                    segment.isMember ? 1 : 0,
                  ),
                ],
              }
            : {}),
          expressions: [expression(BREAKOUT_COLUMN, value(label, "type/Text"))],
          breakout: [col(actor), expressionRef(BREAKOUT_COLUMN, "type/Text")],
        }),
      );
      const [first, ...rest] = names;
      if (first === undefined) {
        throw new Error("A segments breakout needs at least one group");
      }
      return [
        ...groups,
        stage(ACTOR_BREAKOUTS_CTE, first, { "union-all": rest }),
      ];
    }
  }
};

/**
 * What an aggregating stage over actor rows adds to count per group: the join
 * to each actor's groups, and the `breakout` column to group by. Nothing
 * without a breakout.
 */
export const withBreakout = (
  spec: AnalysisSpec,
  actor: Column,
  /** The join the stage reads its actors through, if not its source. */
  actorJoin?: string,
): { joins: Join[]; expressions: Clause[]; breakout: () => Clause[] } =>
  spec.breakout === undefined
    ? { joins: [], expressions: [], breakout: () => [] }
    : {
        joins: [
          joinStage(
            ACTOR_BREAKOUTS_CTE,
            BREAKOUT_JOIN,
            [eq(col(actor, actorJoin), col(actor, BREAKOUT_JOIN))],
            { strategy: "inner-join" },
          ),
        ],
        expressions: [
          expression(
            BREAKOUT_COLUMN,
            field(BREAKOUT_COLUMN, "type/Text", BREAKOUT_JOIN),
          ),
        ],
        breakout: () => [expressionRef(BREAKOUT_COLUMN, "type/Text")],
      };
