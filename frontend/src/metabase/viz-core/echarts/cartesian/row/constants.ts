export const ROW_CHART_STYLE = {
  // Legacy row charts used a band scale with 0.2 padding; ECharts' default gap
  // varies with the stack count (31% for one stack).
  barCategoryGap: "20%",
  // The same band scale also kept 0.2 of a band clear at each end of the plot.
  bandOuterPadding: 0.2,
} as const;
