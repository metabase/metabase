import { t } from "ttag";

import type { AnalysisSpec, PathsSpec } from "../../spec/types";
import { PATHS_COLUMNS } from "../../sql/analyses/path-nodes";
import { getPathDepth } from "../../sql/analyses/paths";
import { seconds } from "../../sql/compile/actorPredicate";
import {
  type BaseType,
  type Clause,
  aggregation,
  asc,
  caseWhen,
  clause,
  desc,
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

// A step is noisy when it makes up at least this share of all steps...
const NOISY_SHARE = 0.2;
// ...and at least this many times an even split, so a short list of steps
// isn't all noise.
const NOISY_FAIR_SHARE_MULTIPLE = 3;

const integer = (name: string, joinAlias?: string) =>
  field(name, "type/Integer", joinAlias);
const text = (name: string, joinAlias?: string) =>
  field(name, "type/Text", joinAlias);
const datetime = (name: string) => field(name, "type/DateTime");

const anyOf = (conditions: Clause[]): Clause => {
  const [first, ...rest] = conditions;
  if (first === undefined) {
    throw new Error("anyOf needs at least one condition");
  }
  return rest.length === 0 ? first : clause("or", first, ...rest);
};

/** A 0/1 column that is 1 when any of `flags` is. */
const anyFlag = (flags: string[]): Clause =>
  flags.length > 0
    ? caseWhen([[anyOf(flags.map(flagIsSet)), 1]], 0)
    : value(1, "type/Integer");

/**
 * A node's key: the position keeps a repeated event from looping back, and
 * the kind keeps an event apart from a grouped or terminal node.
 */
const nodeKey = (position: Clause, kind: () => Clause, name: () => Clause) =>
  clause(
    "concat",
    clause("text", position),
    ". ",
    caseWhen(
      [[eq(kind(), "step"), name()]],
      clause(
        "concat",
        "(",
        kind(),
        ")",
        caseWhen([[eq(name(), ""), ""]], clause("concat", " ", name())),
      ),
    ),
  );

/** The text shown for a node. */
const nodeLabel = (kind: () => Clause, name: () => Clause) =>
  caseWhen(
    [
      [eq(kind(), "other"), t`(Other)`],
      [eq(kind(), "dropped"), t`(Dropped off)`],
    ],
    name(),
  );

const pathsQuery = (
  spec: AnalysisSpec,
  paths: PathsSpec,
  base: MbqlBase,
): Query => {
  const depth = getPathDepth(paths);
  const start = paths.direction !== "to" ? paths.start : null;
  const end = paths.direction !== "from" ? paths.end : null;
  const isSessionActor = spec.grain === "session";
  const visitsBySession = paths.visit.kind === "session";
  const visitGap =
    paths.visit.kind === "inactivity" ? paths.visit.gap : undefined;
  const stepName = (): Clause => {
    const eventName = clause("coalesce", roleExpr(base, "event_name"), "");
    return spec.pageview !== undefined
      ? caseWhen(
          [[flagIsSet(spec.pageview.flag), roleExpr(base, "url_path")]],
          eventName,
        )
      : eventName;
  };
  const scoped = scopedEvents(spec, base, {
    extraColumns: [
      {
        name: "is_step",
        expr: anyFlag(paths.included.map(({ flag }) => flag)),
        baseType: "type/Integer",
      },
      {
        name: "is_start",
        expr:
          start !== null
            ? field(start.flag, "type/Integer")
            : value(0, "type/Integer"),
        baseType: "type/Integer",
      },
      {
        name: "is_end",
        expr:
          end !== null
            ? field(end.flag, "type/Integer")
            : value(0, "type/Integer"),
        baseType: "type/Integer",
      },
      { name: "step_name", expr: stepName(), baseType: "type/Text" },
      ...(visitsBySession && !isSessionActor
        ? [
            {
              name: "session",
              expr: roleExpr(base, "session"),
              baseType: base.columnTypes.session,
            },
          ]
        : []),
    ],
    breakoutAnchor: start !== null ? () => flagIsSet("is_start") : undefined,
  });
  const actor = () => col(scoped.actor);
  const ts = () => datetime(scoped.ts.name);
  const visitType: BaseType = visitsBySession
    ? isSessionActor
      ? "type/Integer"
      : base.columnTypes.session
    : "type/Integer";
  const visit = (alias?: string) => field("visit", visitType, alias);
  const pathEvents = () =>
    anyOf(["is_step", "is_start", "is_end"].map(flagIsSet));
  const byActor = () => ({ partitionBy: [actor()], orderBy: [asc(ts())] });
  const byVisit = (order: Clause) => ({
    partitionBy: [actor(), visit()],
    orderBy: [asc(order)],
  });

  const visitStages: MbqlStage[] =
    visitGap === undefined
      ? [
          stage("visits", SCOPED_EVENTS, {
            filters: [pathEvents()],
            expressions: [
              expression(
                "visit",
                isSessionActor
                  ? value(0, "type/Integer")
                  : field("session", base.columnTypes.session),
              ),
            ],
          }),
        ]
      : [
          // A break longer than the gap starts a new visit.
          stage("visit_rows", SCOPED_EVENTS, {
            filters: [pathEvents()],
            expressions: [
              expression(
                "row_in_actor",
                window(clause("row-number"), byActor()),
              ),
              expression(
                "previous_ts",
                window(clause("lag", ts(), 1, ts()), byActor()),
              ),
            ],
          }),
          stage("visit_breaks", undefined, {
            expressions: [
              expression(
                "new_visit",
                caseWhen(
                  [
                    [
                      clause(
                        "or",
                        eq(integer("row_in_actor"), 1),
                        clause(
                          ">",
                          clause(
                            "datetime-diff",
                            datetime("previous_ts"),
                            ts(),
                            "second",
                          ),
                          seconds(visitGap),
                        ),
                      ),
                      1,
                    ],
                  ],
                  0,
                ),
              ),
            ],
          }),
          stage("visits", undefined, {
            expressions: [
              expression(
                "visit",
                window(clause("sum", integer("new_visit")), {
                  ...byActor(),
                  frame: {
                    mode: "rows",
                    start: "unbounded-preceding",
                    end: "current-row",
                  },
                }),
              ),
            ],
          }),
        ];

  const noisyStages: MbqlStage[] = paths.hideNoisyEvents
    ? [
        stage("step_counts", "visits", {
          breakout: [text("step_name")],
          aggregation: [aggregation("events", clause("count"))],
        }),
        stage("step_totals", undefined, {
          expressions: [
            expression("total", window(clause("sum", integer("events")))),
            expression("step_names", window(clause("count"))),
          ],
        }),
        stage("noisy_steps", undefined, {
          filters: [
            clause(
              ">=",
              clause("/", integer("events"), integer("total")),
              caseWhen(
                [
                  [
                    clause(
                      ">=",
                      NOISY_SHARE,
                      clause(
                        "/",
                        NOISY_FAIR_SHARE_MULTIPLE,
                        integer("step_names"),
                      ),
                    ),
                    NOISY_SHARE,
                  ],
                ],
                clause("/", NOISY_FAIR_SHARE_MULTIPLE, integer("step_names")),
              ),
            ),
          ],
          // A marker to anti-join on: `:is-null` on a text column is also true
          // of the empty string, which is a step name.
          expressions: [expression("is_noisy", value(1, "type/Integer"))],
          fields: [
            text("step_name"),
            expressionRef("is_noisy", "type/Integer"),
          ],
        }),
      ]
    : [];

  const orderedStages: MbqlStage[] = [
    stage("visit_steps", "visits", {
      ...(paths.hideNoisyEvents
        ? {
            joins: [
              joinStage(
                "noisy_steps",
                "noisy",
                [eq(text("step_name"), text("step_name", "noisy"))],
                { fields: [integer("is_noisy", "noisy")] },
              ),
            ],
            filters: [
              anyOf([
                flagIsSet("is_start"),
                flagIsSet("is_end"),
                clause("is-null", integer("is_noisy", "noisy")),
              ]),
            ],
          }
        : {}),
      expressions: [
        expression(
          "previous_name",
          window(clause("lag", text("step_name"), 1, ""), byVisit(ts())),
        ),
      ],
    }),
    stage("ordered_steps", undefined, {
      ...(paths.mergeRepeats
        ? {
            filters: [
              clause(
                "or",
                eq(text("previous_name"), ""),
                clause("!=", text("previous_name"), text("step_name")),
              ),
            ],
          }
        : {}),
      expressions: [
        expression("position", window(clause("row-number"), byVisit(ts()))),
      ],
      fields: [
        actor(),
        visit(),
        ts(),
        text("step_name"),
        integer("is_start"),
        integer("is_end"),
        expressionRef("position", "type/Integer"),
      ],
    }),
  ];

  const endsAt = end !== null ? "min" : "max";
  const position = () => integer("position");
  const boundStages: MbqlStage[] = (() => {
    switch (paths.direction) {
      case "from":
        return [
          stage("bound_positions", "ordered_steps", {
            ...(start !== null ? { filters: [flagIsSet("is_start")] } : {}),
            breakout: [actor(), visit()],
            aggregation: [
              aggregation("first_position", clause("min", position())),
            ],
          }),
          stage("bounds", undefined, {
            expressions: [
              expression(
                "last_position",
                clause("+", integer("first_position"), depth),
              ),
            ],
          }),
        ];
      case "to":
        // first_position can go below 1 so the ending event always lands on
        // the same step number, however many steps a visit had before it.
        return [
          stage("bound_positions", "ordered_steps", {
            ...(end !== null ? { filters: [flagIsSet("is_end")] } : {}),
            breakout: [actor(), visit()],
            aggregation: [
              aggregation("last_position", clause(endsAt, position())),
            ],
          }),
          stage("bounds", undefined, {
            expressions: [
              expression(
                "first_position",
                clause("-", integer("last_position"), depth),
              ),
            ],
          }),
        ];
      case "between":
        return [
          stage("bound_starts", "ordered_steps", {
            ...(start !== null ? { filters: [flagIsSet("is_start")] } : {}),
            breakout: [actor(), visit()],
            aggregation: [
              aggregation("first_position", clause("min", position())),
            ],
          }),
          stage("bound_ends", "ordered_steps", {
            joins: [
              joinStage(
                "bound_starts",
                "s",
                [eq(actor(), col(scoped.actor, "s")), eq(visit(), visit("s"))],
                { strategy: "inner-join" },
              ),
            ],
            filters: [
              ...(end !== null ? [flagIsSet("is_end")] : []),
              clause(">", position(), integer("first_position", "s")),
            ],
            breakout: [actor(), visit(), integer("first_position", "s")],
            aggregation: [
              aggregation("last_position", clause(endsAt, position())),
            ],
          }),
          stage("bounds", undefined, {
            filters: [
              clause(
                "<=",
                clause(
                  "-",
                  integer("last_position"),
                  integer("s__first_position"),
                ),
                depth,
              ),
            ],
            expressions: [
              expression("first_position", integer("s__first_position")),
            ],
            fields: [
              actor(),
              visit(),
              expressionRef("first_position", "type/Integer"),
              integer("last_position"),
            ],
          }),
        ];
    }
  })();

  const volume = () =>
    isSessionActor ? clause("count") : clause("distinct", actor());
  const kind = () => expressionRef("kind", "type/Text");
  const nodeName = () => expressionRef("node_name", "type/Text");
  const targetKind = () => expressionRef(PATHS_COLUMNS.targetKind, "type/Text");
  const groups = withBreakout(spec, scoped.actor);

  return new StageList()
    .add(...baseStages(base), ...scoped.stages)
    .add(...visitStages, ...noisyStages, ...orderedStages, ...boundStages)
    .add(
      // Each visit's steps inside its window, numbered from 1 in time order.
      stage("numbered", "ordered_steps", {
        joins: [
          joinStage(
            "bounds",
            "b",
            [eq(actor(), col(scoped.actor, "b")), eq(visit(), visit("b"))],
            { strategy: "inner-join" },
          ),
        ],
        filters: [
          clause(
            "between",
            position(),
            integer("first_position", "b"),
            integer("last_position", "b"),
          ),
        ],
        expressions: [
          expression(
            "step",
            clause(
              "+",
              clause("-", position(), integer("first_position", "b")),
              1,
            ),
          ),
        ],
        fields: [
          actor(),
          visit(),
          text("step_name"),
          expressionRef("step", "type/Integer"),
        ],
      }),
      // The biggest events at each step, with at least the minimum volume.
      stage("step_volumes", undefined, {
        breakout: [integer("step"), text("step_name")],
        aggregation: [aggregation("volume", volume())],
      }),
      stage("step_ranks", undefined, {
        filters: [clause(">=", integer("volume"), paths.minVolume)],
        expressions: [
          expression(
            "step_rank",
            window(clause("row-number"), {
              partitionBy: [integer("step")],
              orderBy: [desc(integer("volume")), asc(text("step_name"))],
            }),
          ),
        ],
      }),
      stage("kept_steps", undefined, {
        filters: [clause("<=", integer("step_rank"), paths.maxNodes)],
        fields: [integer("step"), text("step_name")],
      }),
      // Each visit's steps, with the events too small to show grouped into Other.
      stage("grouped_steps", "numbered", {
        joins: [
          joinStage(
            "kept_steps",
            "k",
            [
              eq(integer("step"), integer("step", "k")),
              eq(text("step_name"), text("step_name", "k")),
            ],
            { fields: [integer("step", "k")] },
          ),
        ],
        expressions: [
          expression(
            "node_name",
            caseWhen(
              [[clause("not-null", integer("step", "k")), text("step_name")]],
              "",
            ),
          ),
          expression(
            "kind",
            caseWhen(
              [[clause("not-null", integer("step", "k")), "step"]],
              "other",
            ),
          ),
        ],
        fields: [actor(), visit(), integer("step"), nodeName(), kind()],
      }),
      stage("edge_next", undefined, {
        expressions: [
          expression(
            "next_name",
            window(
              clause("lead", text("node_name"), 1, ""),
              byVisit(integer("step")),
            ),
          ),
          expression(
            "next_kind",
            window(
              clause("lead", text("kind"), 1, ""),
              byVisit(integer("step")),
            ),
          ),
        ],
      }),
      // One row per step, from each step to the next. Keys carry the step
      // number, so a repeated step is a new node, not a loop.
      stage("edges", undefined, {
        // Only "from" has paths that can end early; the others end at their
        // ending event.
        filters: [
          paths.direction === "from"
            ? clause(
                "or",
                clause("!=", text("next_kind"), ""),
                clause("<=", integer("step"), depth),
              )
            : clause("!=", text("next_kind"), ""),
        ],
        expressions: [
          expression(
            PATHS_COLUMNS.targetKind,
            caseWhen(
              [[eq(text("next_kind"), ""), "dropped"]],
              text("next_kind"),
            ),
          ),
          expression(
            "source",
            nodeKey(
              integer("step"),
              () => text("kind"),
              () => text("node_name"),
            ),
          ),
          expression(
            "target",
            nodeKey(clause("+", integer("step"), 1), targetKind, () =>
              text("next_name"),
            ),
          ),
          expression(
            PATHS_COLUMNS.sourceLabel,
            nodeLabel(
              () => text("kind"),
              () => text("node_name"),
            ),
          ),
          expression(
            PATHS_COLUMNS.targetLabel,
            nodeLabel(targetKind, () => text("next_name")),
          ),
        ],
        fields: [
          integer("step"),
          expressionRef("source", "type/Text"),
          expressionRef("target", "type/Text"),
          expressionRef(PATHS_COLUMNS.sourceLabel, "type/Text"),
          expressionRef(PATHS_COLUMNS.targetLabel, "type/Text"),
          targetKind(),
          actor(),
        ],
      }),
      // The nodes are picked from everyone's steps, so each group's links share them.
      stage("paths", undefined, {
        joins: groups.joins,
        expressions: groups.expressions,
        breakout: [
          integer("step"),
          text("source"),
          text("target"),
          text(PATHS_COLUMNS.sourceLabel),
          text(PATHS_COLUMNS.targetLabel),
          text(PATHS_COLUMNS.targetKind),
          ...groups.breakout(),
        ],
        aggregation: [aggregation("weight", volume())],
        "order-by": [asc(integer("step"))],
      }),
    )
    .toQuery(base.database);
};

export const buildPathsQuery = (spec: AnalysisSpec, base: MbqlBase): Query => {
  const paths = spec.paths;
  if (paths === undefined) {
    throw new Error("A paths analysis needs paths settings");
  }
  return pathsQuery(spec, paths, base);
};
