export const chartSkeletonDisplayTypes = [
  "area",
  "bar",
  "funnel",
  "gauge",
  "line",
  "map",
  "object",
  "pivot",
  "table",
  "pie",
  "progress",
  "row",
  "scalar",
  "scatter",
  "smartscalar",
  "waterfall",
] as const;

export type ChartSkeletonDisplayType = typeof chartSkeletonDisplayTypes[number];
