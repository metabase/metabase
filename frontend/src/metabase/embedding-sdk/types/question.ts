import type { VisualizationSettings } from "metabase-types/api/card";
import type { DatasetQuery } from "metabase-types/api/query";
import type { CustomVizDisplayType } from "metabase-types/api/visualization";

export interface MetabaseQuestion {
  id: number;
  name: string;
  description: string | null;
  entityId: string;

  isSavedQuestion: boolean;
}

/**
 * Each visualization below exposes a curated subset of {@link VisualizationSettings}
 * via `Pick`. Only these keys are allowed, so `visualizationSettings` autocompletes
 * and typechecks against the chosen `visualization`. To surface another setting,
 * add its key to the relevant family. Custom visualizations (`custom:...`) are the
 * exception and accept any settings.
 */

/** Bar, line, area, combo, row. */
export type CartesianVisualizationSettings = Pick<
  VisualizationSettings,
  | "graph.dimensions"
  | "graph.metrics"
  | "graph.series_order"
  | "graph.show_values"
  | "graph.show_trendline"
  | "graph.show_goal"
  | "graph.goal_value"
  | "graph.goal_label"
  | "graph.x_axis.title_text"
  | "graph.x_axis.scale"
  | "graph.x_axis.axis_enabled"
  | "graph.y_axis.title_text"
  | "graph.y_axis.scale"
  | "graph.y_axis.auto_range"
  | "graph.y_axis.min"
  | "graph.y_axis.max"
  | "stackable.stack_type"
  | "series_settings"
  | "column_settings"
>;

/** Scatter plot: cartesian axes plus a bubble-size column. */
export type ScatterVisualizationSettings = Pick<
  VisualizationSettings,
  | "graph.dimensions"
  | "graph.metrics"
  | "graph.x_axis.scale"
  | "graph.y_axis.scale"
  | "scatter.bubble"
  | "series_settings"
  | "column_settings"
>;

/** Waterfall chart. */
export type WaterfallVisualizationSettings = Pick<
  VisualizationSettings,
  | "graph.dimensions"
  | "graph.metrics"
  | "graph.show_values"
  | "waterfall.increase_color"
  | "waterfall.decrease_color"
  | "waterfall.total_color"
  | "waterfall.show_total"
  | "column_settings"
>;

/** Table, pivot, object detail, list. */
export type TableVisualizationSettings = Pick<
  VisualizationSettings,
  | "table.columns"
  | "table.column_formatting"
  | "pivot_table.column_split"
  | "pivot_table.collapsed_rows"
  | "column_settings"
>;

/** Pie / donut. */
export type PieVisualizationSettings = Pick<
  VisualizationSettings,
  | "pie.dimension"
  | "pie.metric"
  | "pie.sort_rows"
  | "pie.show_legend"
  | "pie.show_total"
  | "pie.show_labels"
  | "pie.percent_visibility"
  | "pie.decimal_places"
  | "pie.slice_threshold"
  | "pie.colors"
  | "column_settings"
>;

/** Scalar, smart scalar (trend), gauge, progress. */
export type ScalarVisualizationSettings = Pick<
  VisualizationSettings,
  | "scalar.field"
  | "scalar.switch_positive_negative"
  | "scalar.compact_primary_number"
  | "scalar.comparisons"
  | "column_settings"
>;

/** Funnel. */
export type FunnelVisualizationSettings = Pick<
  VisualizationSettings,
  "funnel.rows" | "column_settings"
>;

/** Sankey. */
export type SankeyVisualizationSettings = Pick<
  VisualizationSettings,
  | "sankey.source"
  | "sankey.target"
  | "sankey.value"
  | "sankey.node_align"
  | "sankey.show_edge_labels"
  | "column_settings"
>;

/** Box plot. */
export type BoxplotVisualizationSettings = Pick<
  VisualizationSettings,
  | "boxplot.whisker_type"
  | "boxplot.points_mode"
  | "boxplot.show_mean"
  | "boxplot.show_values_mode"
  | "column_settings"
>;

/** Map (pin/region). No map-specific keys are surfaced yet. */
export type MapVisualizationSettings = Pick<
  VisualizationSettings,
  "column_settings"
>;

interface MetabaseCardBase {
  query: DatasetQuery;
  displayIsLocked?: boolean;
}

export type MetabaseCard = MetabaseCardBase &
  (
    | {
        visualization: "table" | "pivot" | "object" | "list";
        visualizationSettings?: TableVisualizationSettings;
      }
    | {
        visualization: "bar" | "line" | "area" | "combo" | "row";
        visualizationSettings?: CartesianVisualizationSettings;
      }
    | {
        visualization: "scatter";
        visualizationSettings?: ScatterVisualizationSettings;
      }
    | {
        visualization: "waterfall";
        visualizationSettings?: WaterfallVisualizationSettings;
      }
    | { visualization: "pie"; visualizationSettings?: PieVisualizationSettings }
    | {
        visualization: "scalar" | "smartscalar" | "gauge" | "progress";
        visualizationSettings?: ScalarVisualizationSettings;
      }
    | {
        visualization: "funnel";
        visualizationSettings?: FunnelVisualizationSettings;
      }
    | { visualization: "map"; visualizationSettings?: MapVisualizationSettings }
    | {
        visualization: "sankey";
        visualizationSettings?: SankeyVisualizationSettings;
      }
    | {
        visualization: "boxplot";
        visualizationSettings?: BoxplotVisualizationSettings;
      }
    | {
        visualization: CustomVizDisplayType;
        visualizationSettings?: Record<string, unknown>;
      }
  );
