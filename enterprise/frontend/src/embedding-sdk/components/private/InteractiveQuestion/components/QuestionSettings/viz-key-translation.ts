export const VisualizationSettingsDisplayNames = {
  // Graph General
  ShowValues: "graph.show_values",
  StackType: "stackable.stack_type",
  ShowStackValues: "graph.show_stack_values",
  MaxCategoriesEnabled: "graph.max_categories_enabled",
  MaxCategories: "graph.max_categories",
  OtherCategoryAggregationFunction: "graph.other_category_aggregation_fn",

  // Table
  TableColumns: "table.columns",
  ColumnSettings: "column_settings",

  // X-Axis
  XAxisTitleText: "graph.x_axis.title_text",
  XAxisScale: "graph.x_axis.scale",
  XAxisEnabled: "graph.x_axis.axis_enabled",

  // Y-Axis
  YAxisTitleText: "graph.y_axis.title_text",
  YAxisScale: "graph.y_axis.scale",
  YAxisEnabled: "graph.y_axis.axis_enabled",
  YAxisMinimum: "graph.y_axis.min",
  YAxisMaximum: "graph.y_axis.max",

  // Goal
  GoalValue: "graph.goal_value",
  ShowGoal: "graph.show_goal",
  GoalLabel: "graph.goal_label",

  // Trend
  ShowTrendline: "graph.show_trendline",

  // Series
  Dimensions: "graph.dimensions",
  Metrics: "graph.metrics",
  SeriesSettings: "series_settings",
  SeriesOrder: "graph.series_order",

  // Scatter Plot
  ScatterBubble: "scatter.bubble",

  // Waterfall
  WaterfallIncreaseColor: "waterfall.increase_color",
  WaterfallDecreaseColor: "waterfall.decrease_color",
  WaterfallTotalColor: "waterfall.total_color",
  WaterfallShowTotal: "waterfall.show_total",

  // Funnel
  FunnelRows: "funnel.rows",

  // Table Formatting
  TableColumnFormatting: "table.column_formatting",
  PivotTableCollapsedRows: "pivot_table.collapsed_rows",

  // Scalar
  ScalarComparisons: "scalar.comparisons",
  ScalarField: "scalar.field",
  ScalarSwitchPositiveNegative: "scalar.switch_positive_negative",
  ScalarCompactPrimaryNumber: "scalar.compact_primary_number",

  // Pie Chart
  PieDimension: "pie.dimension",
  PieMiddleDimension: "pie.middle_dimension",
  PieOuterDimension: "pie.outer_dimension",
  PieRows: "pie.rows",
  PieMetric: "pie.metric",
  PieSortRows: "pie.sort_rows",
  PieShowLegend: "pie.show_legend",
  PieShowTotal: "pie.show_total",
  PieShowLabels: "pie.show_labels",
  PiePercentVisibility: "pie.percent_visibility",
  PieDecimalPlaces: "pie.decimal_places",
  PieSliceThreshold: "pie.slice_threshold",
  PieColors: "pie.colors",

  // Embed
  IframeUrl: "iframe",
} as const;

export type QuestionSettingKey = keyof typeof VisualizationSettingsDisplayNames;
