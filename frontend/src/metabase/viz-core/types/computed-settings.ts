import type {
  ColumnSettings,
  SeriesSettings,
  VisualizationSettings,
} from "metabase-types/api";

import type {
  LegacySeriesSettingsObjectKey,
  YAxisSides,
} from "../echarts/cartesian/model/types";

import type { RemappingHydratedDatasetColumn } from "./columns";

export type ComputedVisualizationSettings = VisualizationSettings & {
  /** Computed, never stored. Absent when the chart type does not compute it. */
  "graph.y_axis._axes"?: YAxisSides;
  column?: (col: RemappingHydratedDatasetColumn) => ColumnSettings;
  series?: (key: LegacySeriesSettingsObjectKey) => SeriesSettings;
  nested?: (value: unknown) => unknown;
};
