import { BREAKDOWN_SEGMENT_COLUMN } from "./analyses/breakdown";
import {
  COLUMN_ROLES,
  type ColumnRoles,
  PLANNER_COLUMN_NAMES,
  type ProjectedColumn,
} from "./columns";
import type { AnalysisSpec } from "./spec/types";
import { planCohorts } from "./sql/analyses/cohorts";
import { planFunnel } from "./sql/analyses/funnel";
import { planFunnelInsights } from "./sql/analyses/funnel-insights";
import { planHabit } from "./sql/analyses/habit";
import { planLifecycle } from "./sql/analyses/lifecycle";
import { planPaths } from "./sql/analyses/paths";
import { ident } from "./sql/compile/dialect";
import { flagSql } from "./sql/compile/flag";
import { type Cte, CycleError, type QueryPlan, compose } from "./sql/compose";

export interface BuiltSql {
  sql: string;
  warnings: string[];
  spec: AnalysisSpec;
  ctes: Cte[];
}

export type BaseColumns = {
  columns: ColumnRoles;
  flags: string[];
  extraColumns: ProjectedColumn[];
};

const planAnalysis = (spec: AnalysisSpec): QueryPlan => {
  switch (spec.kind) {
    case "funnel":
      return spec.funnel?.breakdown !== undefined
        ? planFunnelInsights(spec, {
            kind: "explore",
            transition: spec.funnel.breakdown.transition,
            attributes: spec.funnel.breakdown.attributes,
            segmentLabel: BREAKDOWN_SEGMENT_COLUMN,
          })
        : planFunnel(spec);
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
  { columns, flags, extraColumns }: BaseColumns,
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
  ].join("\n");
};

/** `plan` defaults to the analysis's own query. */
export const buildSql = (
  spec: AnalysisSpec,
  baseSql: string,
  baseColumns: BaseColumns,
  plan: QueryPlan = planAnalysis(spec),
): BuiltSql => {
  const eventsBase: Cte = {
    name: "events_base",
    note: "MBQL-compiled event stream, with columns renamed for the planners",
    deps: [],
    body: projectBase(baseSql, baseColumns),
  };
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
