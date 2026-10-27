import type {
  AnalysisSpec,
  LifecycleSpec,
  LifecycleStateName,
} from "../../spec/types";
import { BREAKOUT_COLUMN } from "../../sql/analyses/breakout";
import {
  FIRST_SEEN_EXTRA_COLUMN,
  LIFECYCLE_VALUE_COLUMN,
} from "../../sql/analyses/lifecycle";
import { IN_RANGE_FLAG } from "../../sql/analyses/lookback";
import {
  type Clause,
  aggregation,
  asc,
  bucketed,
  caseWhen,
  clause,
  eq,
  expression,
  expressionRef,
  field,
  value,
  window,
} from "../clause";
import {
  type MbqlStage,
  type Query,
  StageList,
  joinStage,
  stage,
} from "../query";

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

const ALL_STATES: LifecycleStateName[] = [
  "new",
  "returning",
  "resurrected",
  "dormant",
];

const integer = (name: string, joinAlias?: string) =>
  field(name, "type/Integer", joinAlias);
const text = (name: string) => field(name, "type/Text");

/** What an actor adds to their state's bar in a period, over their events in it. */
const amountOf = (lifecycle: LifecycleSpec, actor: Clause, base: MbqlBase) => {
  switch (lifecycle.counted) {
    case "person":
      return clause("distinct", actor);
    case "session":
      return clause("distinct", field("session", base.columnTypes.session));
    case "event":
      return clause("count");
  }
};

/**
 * Each actor's active periods in the range as new, returning or resurrected,
 * and the period after their last active one in a run as dormant, counted
 * negative.
 */
const lifecycleQuery = (
  spec: AnalysisSpec,
  lifecycle: LifecycleSpec,
  base: MbqlBase,
): Query => {
  const period = lifecycle.period;
  const scoped = scopedEvents(spec, base, {
    match: lifecycle.active,
    extraColumns:
      lifecycle.counted === "session"
        ? [
            {
              name: "session",
              expr: roleExpr(base, "session"),
              baseType: base.columnTypes.session,
            },
          ]
        : [],
  });
  const ts = (alias?: string) => field(scoped.ts.name, "type/DateTime", alias);
  const actor = () => col(scoped.actor);
  const byActor = () => ({
    partitionBy: [actor()],
    orderBy: [asc(ts())],
  });
  const nextPeriod = (expr: Clause) => clause("datetime-add", expr, 1, period);
  const shown = spec.output.lifecycleShown ?? ALL_STATES;
  const wanted = shown.filter((state) => state !== "dormant");
  const breakoutField =
    spec.breakout !== undefined ? [text(BREAKOUT_COLUMN)] : [];
  const rowFields = () => [
    ...(spec.breakout !== undefined ? [text(BREAKOUT_COLUMN)] : []),
    expressionRef("period", "type/DateTime"),
    expressionRef("state", "type/Text"),
    expressionRef(LIFECYCLE_VALUE_COLUMN, "type/Integer"),
  ];
  const activeGroups = withBreakout(spec, scoped.actor);
  const quietGroups = withBreakout(spec, scoped.actor);

  const stages = new StageList().add(...baseStages(base), ...scoped.stages).add(
    stage("actor_periods", SCOPED_EVENTS, {
      breakout: [actor(), bucketed(scoped.ts.name, period)],
      aggregation: [
        aggregation(IN_RANGE_FLAG, clause("max", integer(IN_RANGE_FLAG))),
        ...(lifecycle.hasFirstSeen
          ? [
              aggregation(
                "first_seen_at",
                clause("min", field(FIRST_SEEN_EXTRA_COLUMN, "type/DateTime")),
              ),
            ]
          : []),
        aggregation("amount", amountOf(lifecycle, actor(), base)),
      ],
    }),
    stage("range_periods", undefined, {
      filters: [flagIsSet(IN_RANGE_FLAG)],
      breakout: [ts()],
    }),
    // The actor's previous and next active periods, and their first.
    stage("period_neighbours", "actor_periods", {
      expressions: [
        expression("previous", window(clause("lag", ts(), 1), byActor())),
        expression("next", window(clause("lead", ts(), 1), byActor())),
        ...(lifecycle.hasFirstSeen
          ? []
          : [
              expression(
                "first_period",
                window(clause("min", ts()), { partitionBy: [actor()] }),
              ),
            ]),
      ],
    }),
    stage("classified", undefined, {
      filters: [flagIsSet(IN_RANGE_FLAG)],
      expressions: [
        expression(
          "state",
          caseWhen(
            [
              [
                eq(
                  ts(),
                  lifecycle.hasFirstSeen
                    ? bucketed("first_seen_at", period)
                    : field("first_period", "type/DateTime"),
                ),
                "new",
              ],
              [
                eq(
                  field("previous", "type/DateTime"),
                  clause("datetime-subtract", ts(), 1, period),
                ),
                "returning",
              ],
            ],
            "resurrected",
          ),
        ),
      ],
    }),
    stage("active_values", undefined, {
      joins: activeGroups.joins,
      expressions: activeGroups.expressions,
      filters: [clause("=", text("state"), ...wanted)],
      breakout: [...activeGroups.breakout(), ts(), text("state")],
      aggregation: [
        aggregation(LIFECYCLE_VALUE_COLUMN, clause("sum", integer("amount"))),
      ],
    }),
    stage("active_rows", undefined, {
      expressions: [
        expression("period", ts()),
        expression("state", text("state")),
        expression(LIFECYCLE_VALUE_COLUMN, integer(LIFECYCLE_VALUE_COLUMN)),
      ],
      fields: rowFields(),
    }),
    // An actor goes quiet in the period after an active period that their
    // next one doesn't follow straight on from, if it's in the range.
    stage("went_quiet", "period_neighbours", {
      joins: [
        joinStage("range_periods", "r", [eq(ts("r"), nextPeriod(ts()))], {
          strategy: "inner-join",
        }),
        ...quietGroups.joins,
      ],
      filters: [
        clause(
          "or",
          clause("is-null", field("next", "type/DateTime")),
          clause(">", field("next", "type/DateTime"), nextPeriod(ts())),
        ),
      ],
      expressions: [
        ...quietGroups.expressions,
        expression("quiet_period", nextPeriod(ts())),
      ],
      breakout: [
        ...quietGroups.breakout(),
        expressionRef("quiet_period", "type/DateTime"),
      ],
      aggregation: [aggregation("amount", clause("sum", integer("amount")))],
    }),
    stage("dormant_rows", undefined, {
      expressions: [
        expression("period", field("quiet_period", "type/DateTime")),
        expression("state", value("dormant", "type/Text")),
        expression(LIFECYCLE_VALUE_COLUMN, clause("-", 0, integer("amount"))),
      ],
      fields: rowFields(),
    }),
  );

  const branches = [
    ...(wanted.length > 0 ? ["active_rows"] : []),
    ...(shown.includes("dormant") ? ["dormant_rows"] : []),
  ];
  const [first, ...rest] = branches;
  if (first === undefined) {
    throw new Error("A lifecycle analysis has to show at least one state");
  }
  const result: MbqlStage = stage("lifecycle", first, {
    "union-all": rest,
    "order-by": [
      ...breakoutField.map(asc),
      asc(field("period", "type/DateTime")),
      asc(text("state")),
    ],
  });
  return stages.add(result).toQuery(base.database);
};

export const buildLifecycleQuery = (
  spec: AnalysisSpec,
  base: MbqlBase,
): Query => {
  const lifecycle = spec.lifecycle;
  if (lifecycle === undefined) {
    throw new Error("A lifecycle analysis needs lifecycle settings");
  }
  return lifecycleQuery(spec, lifecycle, base);
};
