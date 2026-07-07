import type { VisualizationSettings } from "metabase-types/api/card";
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
 *
 * Omit `visualization` when Metabase should infer a display from the query.
 * Set `visualization` when the user or design asks for a specific chart type.
 * Only set `visualizationSettings` when a user or design asks for a specific
 * presentation detail, such as hiding an axis label, showing value labels,
 * stacking bars, adding a goal line, ordering table columns, or showing pie
 * totals.
 */

/**
 * Settings for bar, line, area, combo, and row charts. Use these to pin result
 * columns, labels, scales, stacking, goal lines, trend lines, series order, or
 * per-column formatting.
 */
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

/**
 * Settings for scatter plots. `graph.dimensions` selects the x-axis result
 * column, `graph.metrics` selects the y-axis result column, and
 * `scatter.bubble` optionally selects a numeric bubble-size column.
 */
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

/**
 * Settings for waterfall charts. Use these to choose step/value result
 * columns, show step labels, override waterfall colors, add a total bar, or
 * format columns.
 */
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

/**
 * Settings for table, pivot, object detail, and list displays. Use these for
 * visible column order, conditional formatting, pivot state, and per-column
 * titles or number/currency formatting.
 */
export type TableVisualizationSettings = Pick<
  VisualizationSettings,
  | "table.columns"
  | "table.column_formatting"
  | "pivot_table.column_split"
  | "pivot_table.collapsed_rows"
  | "column_settings"
>;

/**
 * Settings for pie and donut charts. Use these to pin slice/value result
 * columns, sort slices, show legends, labels, totals, percentages, thresholds,
 * colors, or column formatting.
 */
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

/**
 * Settings for scalar, smart scalar, gauge, and progress displays. Use these to
 * select the main value column, compact the number, reverse comparison meaning,
 * configure smart-scalar comparisons, or format columns.
 */
export type ScalarVisualizationSettings = Pick<
  VisualizationSettings,
  | "scalar.field"
  | "scalar.switch_positive_negative"
  | "scalar.compact_primary_number"
  | "scalar.comparisons"
  | "column_settings"
>;

/**
 * Settings for funnel charts. Use `funnel.rows` only when you know the exact
 * row keys and need explicit step order, labels, colors, or enabled state.
 */
export type FunnelVisualizationSettings = Pick<
  VisualizationSettings,
  "funnel.rows" | "column_settings"
>;

/**
 * Settings for Sankey charts. Use these to select source, target, and flow
 * value result columns, control node alignment, show edge labels, or format
 * columns.
 */
export type SankeyVisualizationSettings = Pick<
  VisualizationSettings,
  | "sankey.source"
  | "sankey.target"
  | "sankey.value"
  | "sankey.node_align"
  | "sankey.show_edge_labels"
  | "column_settings"
>;

/**
 * Settings for box plots. Use these to choose whisker calculation, point
 * visibility, mean marker visibility, value label mode, or column formatting.
 */
export type BoxplotVisualizationSettings = Pick<
  VisualizationSettings,
  | "boxplot.whisker_type"
  | "boxplot.points_mode"
  | "boxplot.show_mean"
  | "boxplot.show_values_mode"
  | "column_settings"
>;

/**
 * Settings for pin and region maps. No map-specific settings are surfaced yet;
 * use `column_settings` for stable column formatting only.
 */
export type MapVisualizationSettings = Pick<
  VisualizationSettings,
  "column_settings"
>;

/**
 * Public structural type for ad-hoc SDK queries created by
 * `useMetabaseQueryObject`.
 *
 * @public
 */
export type MetabaseQueryObject =
  // Do not use the internal `DatasetQuery` type here. It carries an opaque marker
  // that can be emitted separately from the main SDK and data-app declaration
  // rollups, making otherwise identical query values fail across package entry
  // points. This structural type keeps those entry points compatible while still
  // being narrow enough to reject passing the whole hook result as `card.query`.
  | { type: "query"; database?: unknown; query?: unknown; parameters?: unknown }
  | {
      type: "native";
      database?: unknown;
      native?: unknown;
      parameters?: unknown;
    }
  | {
      "lib/type": "mbql/query";
      database?: unknown;
      stages?: unknown;
      parameters?: unknown;
    };

interface MetabaseCardBase {
  query: MetabaseQueryObject | null;
  displayIsLocked?: boolean;
}

/**
 * Ad-hoc card definition for SDK-rendered questions. Pass only `query` when
 * Metabase should infer a display from the query result. Add `visualization`
 * when the user or design asks for a specific chart type. Add
 * `visualizationSettings` only for explicit setting-level presentation changes.
 *
 * @notExported MetabaseCardBase
 * @notExported TableVisualizationSettings
 * @notExported CartesianVisualizationSettings
 * @notExported ScatterVisualizationSettings
 * @notExported WaterfallVisualizationSettings
 * @notExported PieVisualizationSettings
 * @notExported ScalarVisualizationSettings
 * @notExported FunnelVisualizationSettings
 * @notExported MapVisualizationSettings
 * @notExported SankeyVisualizationSettings
 * @notExported BoxplotVisualizationSettings
 * @notExported CustomVizDisplayType
 */
export type MetabaseCard = MetabaseCardBase &
  (
    | {
        visualization?: never;
        visualizationSettings?: never;
      }
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
