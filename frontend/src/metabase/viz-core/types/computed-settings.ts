import type {
  ColumnSettings,
  SeriesSettings,
  VisualizationSettings,
} from "metabase-types/api";

import type { LegacySeriesSettingsObjectKey } from "../echarts/cartesian/model/types";

import type { RemappingHydratedDatasetColumn } from "./columns";

export type ComputedVisualizationSettings = VisualizationSettings & {
  column?: (col: RemappingHydratedDatasetColumn) => ColumnSettings;
  series?: (key: LegacySeriesSettingsObjectKey) => SeriesSettings;
  nested?: (value: unknown) => unknown;
};
