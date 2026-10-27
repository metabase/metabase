import type { ColumnRole, ColumnRoles } from "../../columns";
import type {
  ActorPredicate,
  AnalysisSpec,
  CountOp,
  FlagRef,
  Grain,
} from "../../spec/types";
import { IN_RANGE_FLAG, getLookbackDays } from "../../sql/analyses/lookback";
import {
  type BaseType,
  type Clause,
  aggregation,
  and,
  clause,
  eq,
  expression,
  expressionRef,
  field,
  or,
  value,
} from "../clause";
import { type MbqlStage, type Stage, joinStage, stage } from "../query";

import { actorBreakoutStages, breakoutEventColumns } from "./breakout";
import {
  type Column,
  EVENTS_BASE,
  SCOPED_EVENTS,
  SCOPE_ACTORS,
  col,
} from "./common";

export { type Column, EVENTS_BASE, SCOPED_EVENTS, SCOPE_ACTORS, col };

/**
 * Who's in each people segment: a query of the users table with its key and a
 * 0/1 column per segment flag, joined onto the events by their person column.
 */
export interface MbqlPeopleSegments {
  stages: Stage[];
  primaryKey: Column;
  flags: string[];
  /** Of `flags`, the segments every event's person must be in. */
  required: string[];
}

/**
 * The event query an analysis reads: the date range, filters and a 0/1 flag
 * column per event, from the query builder. Planners add stages after it.
 */
export interface MbqlBase {
  database: number;
  stages: Stage[];
  /** Which column of the base query plays each role. */
  columns: ColumnRoles;
  columnTypes: Record<ColumnRole, BaseType>;
  flags: string[];
  /** Further base query columns, read by planners under `as`. */
  extraColumns: { as: string; column: string; baseType: BaseType }[];
  peopleSegments?: MbqlPeopleSegments;
}

const GRAIN_ROLE: Record<Grain, ColumnRole> = {
  person: "person",
  session: "session",
  event: "event_id",
};

/** A base query column by role, or a typed null when no column plays it. */
export const roleExpr = (base: MbqlBase, role: ColumnRole): Clause => {
  const name = base.columns[role];
  const baseType = base.columnTypes[role];
  return name !== null ? field(name, baseType) : value(null, baseType);
};

export const flagIsSet = (flag: string): Clause =>
  eq(field(flag, "type/Integer"), 1);

const PEOPLE_JOIN = "people";

/**
 * The base query, ending in `events_base`. With people segments, that stage
 * left-joins who's in each, as a 0/1 column per segment flag: people without
 * a users table row are in none.
 */
export const baseStages = (base: MbqlBase): Stage[] => {
  const last = base.stages.at(-1);
  if (last === undefined) {
    throw new Error("The base query has no stages");
  }
  const segments = base.peopleSegments;
  if (segments === undefined) {
    return [...base.stages.slice(0, -1), { ...last, name: EVENTS_BASE }];
  }
  if (base.columns.person === null) {
    throw new Error("People segments need a person column to join on");
  }
  const required = segments.required.map(flagIsSet);
  return [
    ...base.stages.slice(0, -1),
    { ...last, name: "events" },
    stage(EVENTS_BASE, undefined, {
      joins: [
        {
          "lib/type": "mbql/join",
          alias: PEOPLE_JOIN,
          strategy: "left-join",
          fields: "none",
          stages: segments.stages,
          conditions: [
            eq(
              clause("text", roleExpr(base, "person")),
              clause("text", col(segments.primaryKey, PEOPLE_JOIN)),
            ),
          ],
        },
      ],
      expressions: segments.flags.map((flag) =>
        expression(
          flag,
          clause("coalesce", field(flag, "type/Integer", PEOPLE_JOIN), 0),
        ),
      ),
      ...(required.length > 0 ? { filters: required } : {}),
    }),
  ];
};

const COUNT_CMP: Record<CountOp, string> = {
  "at least": ">=",
  "at most": "<=",
  exactly: "=",
};

/**
 * "Who's included" as conditions on a stage with a `scope_<n>` count per
 * condition: how many times the actor did that event.
 */
const scopeCondition = (
  predicate: ActorPredicate,
  counts: Clause[],
): Clause | undefined => {
  const counted = (flag: string): Clause => {
    const name = `scope_${counts.length}`;
    counts.push(aggregation(name, clause("count-where", flagIsSet(flag))));
    return field(name, "type/Integer");
  };
  switch (predicate.kind) {
    case "did":
      return clause(
        COUNT_CMP[predicate.cmp],
        counted(predicate.flag),
        predicate.count,
      );
    case "didnt":
      return eq(counted(predicate.flag), 0);
    case "group": {
      const parts = predicate.items
        .map((item) => scopeCondition(item, counts))
        .filter((part): part is Clause => part !== undefined);
      const joined = predicate.joiner === "and" ? and(...parts) : or(...parts);
      return joined !== undefined && predicate.negated
        ? clause("not", joined)
        : joined;
    }
  }
};

export type ScopedEvents = {
  stages: MbqlStage[];
  /** The columns of `scoped_events`. */
  actor: Column;
  ts: Column;
  extra: Column[];
  warnings: string[];
};

export type ScopedEventsOptions = {
  /** Only these events. */
  match?: FlagRef;
  /** Columns beyond the defaults, as expressions on `events_base`. */
  extraColumns?: { name: string; expr: Clause; baseType: BaseType }[];
  /** Further conditions on `events_base`. */
  extraWhere?: Clause[];
  /**
   * A condition on `scoped_events` for the events whose property value can
   * place their actor in a breakout's group. Undefined: any of them can.
   */
  breakoutAnchor?: () => Clause;
};

/**
 * `scoped_events`: every event in range of the actors “who's included”
 * picks, as `actor` and `ts` plus the columns asked for. With a lookback, the
 * events before the range too, marked by `in_range`.
 */
export const scopedEvents = (
  spec: AnalysisSpec,
  base: MbqlBase,
  {
    match,
    extraColumns = [],
    extraWhere = [],
    breakoutAnchor,
  }: ScopedEventsOptions = {},
): ScopedEvents => {
  const actorRole = GRAIN_ROLE[spec.grain];
  const actor: Column = {
    name: "actor",
    baseType: base.columnTypes[actorRole],
  };
  const ts: Column = { name: "ts", baseType: "type/DateTime" };
  const hasLookback = getLookbackDays(spec) > 0;
  const inRange = flagIsSet(IN_RANGE_FLAG);

  const stages: MbqlStage[] = [];
  const counts: Clause[] = [];
  const scope = scopeCondition(spec.scope, counts);
  const scoped = scope !== undefined && counts.length > 0;
  if (scoped) {
    stages.push(
      stage("scope_counts", EVENTS_BASE, {
        ...(hasLookback ? { filters: [inRange] } : {}),
        breakout: [roleExpr(base, actorRole)],
        aggregation: counts,
      }),
      stage(SCOPE_ACTORS, undefined, { filters: [scope] }),
    );
  }

  const extraBase = base.extraColumns.map(({ as, column, baseType }) => ({
    name: as,
    expr: field(column, baseType),
    baseType,
  }));
  const columns = [
    {
      name: actor.name,
      expr: roleExpr(base, actorRole),
      baseType: actor.baseType,
    },
    { name: ts.name, expr: roleExpr(base, "timestamp"), baseType: ts.baseType },
    ...(["event_name", "url_path"] as const).map((role) => ({
      name: role,
      expr: roleExpr(base, role),
      baseType: base.columnTypes[role],
    })),
    ...(hasLookback
      ? [
          {
            name: IN_RANGE_FLAG,
            expr: field(IN_RANGE_FLAG, "type/Integer"),
            baseType: "type/Integer" as const,
          },
        ]
      : []),
    ...extraBase,
    ...extraColumns,
    ...breakoutEventColumns(spec.breakout, base.peopleSegments?.flags ?? []),
  ];
  const filters = [...extraWhere, ...(match ? [flagIsSet(match.flag)] : [])];

  stages.push(
    stage(SCOPED_EVENTS, EVENTS_BASE, {
      ...(scoped
        ? {
            joins: [
              joinStage(
                SCOPE_ACTORS,
                "scope",
                [
                  eq(
                    roleExpr(base, actorRole),
                    field(
                      base.columns[actorRole] ?? "actor",
                      actor.baseType,
                      "scope",
                    ),
                  ),
                ],
                { strategy: "inner-join" },
              ),
            ],
          }
        : {}),
      // Only the expressions are returned, so one can share a name with a
      // base query column.
      expressions: columns.map(({ name, expr }) => expression(name, expr)),
      ...(filters.length > 0 ? { filters } : {}),
      fields: columns.map(({ name, baseType }) =>
        expressionRef(name, baseType),
      ),
    }),
  );

  if (spec.breakout !== undefined) {
    stages.push(
      ...actorBreakoutStages(spec.breakout, actor, ts, breakoutAnchor),
    );
  }

  return {
    stages,
    actor,
    ts,
    extra: [...extraBase, ...extraColumns].map(({ name, baseType }) => ({
      name,
      baseType,
    })),
    warnings: [],
  };
};
