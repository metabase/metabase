import type { AnalysisSpec } from "./spec/types";
import { planCohorts } from "./sql/analyses/cohorts";
import { planFunnel } from "./sql/analyses/funnel";
import { planHabit } from "./sql/analyses/habit";
import { planLifecycle } from "./sql/analyses/lifecycle";
import { planPaths } from "./sql/analyses/paths";
import { type Cte, CycleError, type QueryPlan, compose } from "./sql/compose";

export interface BuiltSql {
  sql: string;
  warnings: string[];
  spec: AnalysisSpec;
  ctes: Cte[];
}

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

export const buildSql = (spec: AnalysisSpec, baseSql: string): BuiltSql => {
  const plan = planAnalysis(spec);
  const eventsBase: Cte = {
    name: "events_base",
    note: "MBQL-compiled event stream with flag columns",
    deps: [],
    body: stripTrailingSemicolon(baseSql),
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
