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

export type BaseColumns = {
  columns: ColumnRoles;
  flags: string[];
  extraColumns: ProjectedColumn[];
  /**
   * Applied here rather than in the MBQL base query: the query processor
   * slows down by ~50ms per literal, so thousands of ids take minutes.
   */
  cohorts?: readonly BaseCohort[];
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

/** Renames the mapped table columns to the names the planners read. */
const projectBase = (
  baseSql: string,
  { columns, flags, extraColumns, cohorts = [] }: BaseColumns,
) => {
  const projected = [
    ...COLUMN_ROLES.map((role) => {
      const source = columns[role];
      const sql = source !== null ? ident(source) : MISSING_COLUMN_SQL[role];
      return `${sql} AS ${PLANNER_COLUMN_NAMES[role]}`;
    }),
    ...extraColumns.map(({ as, alias }) => `${ident(alias)} AS ${as}`),
    ...flags.map(flagSql),
  ];
  return [
    "SELECT",
    projected.map((column) => `  ${column}`).join(",\n"),
    "FROM (",
    stripTrailingSemicolon(baseSql),
    ") AS base",
    ...cohorts.map(
      ({ column, ids }, index) =>
        `${index === 0 ? "WHERE" : "  AND"} toString(${ident(column)}) IN (${ids.length > 0 ? ids.map(lit).join(", ") : "NULL"})`,
    ),
  ].join("\n");
};

const eventsBaseCte = (baseSql: string, baseColumns: BaseColumns): Cte => ({
  name: "events_base",
  note: "MBQL-compiled event stream, with columns renamed for the planners",
  deps: [],
  body: projectBase(baseSql, baseColumns),
});

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
  const ctes = [eventsBaseCte(baseSql, baseColumns), ...plan.ctes];
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

export const buildSql = (
  spec: AnalysisSpec,
  baseSql: string,
  baseColumns: BaseColumns,
): BuiltSql => {
  const plan = planAnalysis(spec);
  const eventsBase = eventsBaseCte(baseSql, baseColumns);
  const merged: QueryPlan = {
    ...plan,
    ctes: [eventsBase, ...plan.ctes],
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
