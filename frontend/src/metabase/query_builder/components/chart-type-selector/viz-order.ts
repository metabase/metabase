import type { CardDisplayType } from "metabase-types/api";

export const DEFAULT_VIZ_ORDER: CardDisplayType[] = [
  "table",
  "bar",
  "line",
  "pie",
  "scalar",
  "row",
  "area",
  "combo",
  "pivot",
  "sql_pivot",
  "smartscalar",
  "gauge",
  "progress",
  "funnel",
  "object",
  "map",
  "scatter",
  "waterfall",
  "response_distribution",
] as const;
