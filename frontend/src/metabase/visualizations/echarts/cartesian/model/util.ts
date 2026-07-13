import type {
  ComputedVisualizationSettings,
  RemappingHydratedDatasetColumn,
} from "metabase/visualizations/types";
import { getColumnSettings } from "metabase-lib/v1/queries/utils/column-key";
import type { ColumnSettings } from "metabase-types/api";

import {
  NEGATIVE_BAR_DATA_LABEL_KEY_SUFFIX,
  POSITIVE_BAR_DATA_LABEL_KEY_SUFFIX,
} from "../constants/dataset";

import type { DataKey } from "./types";

export function getBarSeriesDataLabelKey(dataKey: DataKey, sign: "+" | "-") {
  if (sign === "+") {
    return `${dataKey}_${POSITIVE_BAR_DATA_LABEL_KEY_SUFFIX}`;
  }
  return `${dataKey}_${NEGATIVE_BAR_DATA_LABEL_KEY_SUFFIX}`;
}

export function getFormattingOptionsWithoutScaling(options: ColumnSettings) {
  return { ...options, scale: undefined };
}

export function getColumnScaling(
  column: RemappingHydratedDatasetColumn,
  settings: ComputedVisualizationSettings,
) {
  const columnSettings =
    settings.column?.(column) ?? getColumnSettings(settings, column);
  const scale = columnSettings?.scale;
  // Unjustified type cast. FIXME
  return Number.isFinite(scale) ? (scale as number) : 1;
}
