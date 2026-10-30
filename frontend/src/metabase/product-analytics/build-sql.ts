import {
  COLUMN_ROLES,
  type ColumnRoles,
  PLANNER_COLUMN_NAMES,
  type ProjectedColumn,
} from "./columns";
import type { AnalysisSpec } from "./spec/types";
import { planCohorts } from "./sql/analyses/cohorts";
import { planFunnel } from "./sql/analyses/funnel";
import { planHabit } from "./sql/analyses/habit";
import { planLifecycle } from "./sql/analyses/lifecycle";
import { planPaths } from "./sql/analyses/paths";
import { ident, lit } from "./sql/compile/dialect";
import { flagSql } from "./sql/compile/flag";
import {
  type Cte,
  CycleError,
  type DrillPoint,
  type QueryPlan,
  compose,
} from "./sql/compose";

export interface BuiltSql {
  sql: string;
  warnings: string[];
  spec: AnalysisSpec;
  ctes: Cte[];
}

/** A cohort pill, as ids in one of the base query's columns. */
export type BaseCohort = {
  column: string;
  ids: readonly string[];
};

/**
 * Who's in each people segment, from the users table. MBQL segment clauses
 * only apply to a query's source table, so membership is its own query,
 * joined onto the events by their person column.
 */
export type BasePeopleSegments = {
  /** The compiled users table query: its key, and a 0/1 column per flag. */
  sql: string;
  /** The users table key, as the compiled query names it. */
  primaryKey: string;
  /** The segments' flags, also their column names in `sql`. */
  flags: string[];
  /** Of `flags`, the segments every event's person must be in. */
  required: string[];
};

export type BaseColumns = {
  columns: ColumnRoles;
  flags: string[];
  extraColumns: ProjectedColumn[];
  /**
   * Applied here rather than in the MBQL base query: the query processor
   * slows down by ~50ms per literal, so thousands of ids take minutes.
   */
  cohorts?: readonly BaseCohort[];
  peopleSegments?: BasePeopleSegments;
};

const planAnalysis = (spec: AnalysisSpec): QueryPlan => {
  switch (spec.kind) {
    case "funnel":
      return planFunnel(spec);
    case "habit":
      return planHabit(spec);
    case "lifecycle":
      return planLifecycle(spec);
    case "cohorts":
      return planCohorts(spec);
    case "paths":
      return planPaths(spec);
  }
};

const stripTrailingSemicolon = (sql: string): string =>
  sql.trim().replace(/;+\s*$/, "");

const MISSING_COLUMN_SQL: Record<keyof ColumnRoles, string> = {
  timestamp: "NULL",
  person: "NULL",
  session: "NULL",
  event_id: "NULL",
  event_name: "''",
  url_path: "''",
};

const PEOPLE_SEGMENTS_CTE = "people_segments";
const SEGMENT_PERSON_COLUMN = "segment_person";

/** The membership column a flag is read from in `people_segments`. */
const memberColumn = (flag: string) => `in_${flagSql(flag)}`;

const peopleSegmentsCte = ({
  sql,
  primaryKey,
  flags,
}: BasePeopleSegments): Cte => ({
  name: PEOPLE_SEGMENTS_CTE,
  note: "who's in each people segment, from the users table",
  deps: [],
  body: [
    "SELECT",
    [
      `toString(${ident(primaryKey)}) AS ${SEGMENT_PERSON_COLUMN}`,
      ...flags.map((flag) => `${ident(flag)} AS ${memberColumn(flag)}`),
    ]
      .map((column) => `  ${column}`)
      .join(",\n"),
    "FROM (",
    stripTrailingSemicolon(sql),
    ") AS people",
  ].join("\n"),
});

/** Renames the mapped table columns to the names the planners read. */
const projectBase = (
  baseSql: string,
  { columns, flags, extraColumns, cohorts = [], peopleSegments }: BaseColumns,
) => {
  const segmentFlags = peopleSegments?.flags ?? [];
  const projected = [
    ...COLUMN_ROLES.map((role) => {
      const source = columns[role];
      const sql = source !== null ? ident(source) : MISSING_COLUMN_SQL[role];
      return `${sql} AS ${PLANNER_COLUMN_NAMES[role]}`;
    }),
    ...extraColumns.map(({ as, alias }) => `${ident(alias)} AS ${as}`),
    ...flags.map(flagSql),
    // People without a users table row aren't in any segment.
    ...segmentFlags.map(
      (flag) => `ifNull(${memberColumn(flag)}, 0) AS ${flagSql(flag)}`,
    ),
  ];
  if (peopleSegments !== undefined && columns.person === null) {
    throw new Error("People segments need a person column to join on");
  }
  const joins =
    peopleSegments !== undefined && columns.person !== null
      ? [
          `LEFT JOIN ${PEOPLE_SEGMENTS_CTE}`,
          `  ON toString(${ident(columns.person)}) = ${PEOPLE_SEGMENTS_CTE}.${SEGMENT_PERSON_COLUMN}`,
        ]
      : [];
  const conditions = [
    ...cohorts.map(
      ({ column, ids }) =>
        `toString(${ident(column)}) IN (${ids.length > 0 ? ids.map(lit).join(", ") : "NULL"})`,
    ),
    ...(peopleSegments?.required ?? []).map(
      (flag) => `${memberColumn(flag)} = 1`,
    ),
  ];
  return [
    "SELECT",
    projected.map((column) => `  ${column}`).join(",\n"),
    "FROM (",
    stripTrailingSemicolon(baseSql),
    ") AS base",
    ...joins,
    ...conditions.map(
      (condition, index) => `${index === 0 ? "WHERE" : "  AND"} ${condition}`,
    ),
  ].join("\n");
};

/** `events_base`, and the CTEs it reads. */
const baseCtes = (baseSql: string, baseColumns: BaseColumns): Cte[] => {
  const { peopleSegments } = baseColumns;
  const eventsBase: Cte = {
    name: "events_base",
    note: "MBQL-compiled event stream, with columns renamed for the planners",
    deps: peopleSegments !== undefined ? [PEOPLE_SEGMENTS_CTE] : [],
    body: projectBase(baseSql, baseColumns),
  };
  return peopleSegments !== undefined
    ? [peopleSegmentsCte(peopleSegments), eventsBase]
    : [eventsBase];
};

export const DRILL_MEMBERS_CTE = "drill_members";

/**
 * SQL that reads the actors counted in a clicked point, as a `drill_members`
 * CTE with one `actor` column, through `select`. `null` when the analysis
 * can't trace the point back to actors.
 */
export const buildMembersSql = (
  spec: AnalysisSpec,
  baseSql: string,
  baseColumns: BaseColumns,
  point: DrillPoint,
  select: string,
): string | null => {
  const plan = planAnalysis(spec);
  const members = plan.members?.(point) ?? null;
  if (members === null) {
    return null;
  }
  const ctes = [...baseCtes(baseSql, baseColumns), ...plan.ctes];
  return compose({
    ctes: [
      ...ctes,
      {
        name: DRILL_MEMBERS_CTE,
        note: "the actors in the clicked part of the chart",
        deps: ctes.map((cte) => cte.name),
        body: members,
      },
    ],
    select,
    warnings: [],
  });
};

/** `plan` defaults to the analysis's own query. */
export const buildSql = (
  spec: AnalysisSpec,
  baseSql: string,
  baseColumns: BaseColumns,
  plan: QueryPlan = planAnalysis(spec),
): BuiltSql => {
  const merged: QueryPlan = {
    ...plan,
    ctes: [...baseCtes(baseSql, baseColumns), ...plan.ctes],
  };

  try {
    return {
      sql: compose(merged),
      warnings: [...new Set(merged.warnings)],
      spec,
      ctes: merged.ctes,
    };
  } catch (error) {
    if (error instanceof CycleError) {
      return {
        sql: `-- ${error.message}`,
        warnings: [error.message, ...merged.warnings],
        spec,
        ctes: merged.ctes,
      };
    }
    throw error;
  }
};
