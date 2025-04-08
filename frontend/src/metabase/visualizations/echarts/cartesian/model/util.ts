import Color from "color";

import type { OptionsType } from "metabase/lib/formatting/types";
import type {
  ComputedVisualizationSettings,
  RemappingHydratedDatasetColumn,
} from "metabase/visualizations/types";
import { getColumnSettings } from "metabase-lib/v1/queries/utils/column-key";

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

export function getFormattingOptionsWithoutScaling(options: OptionsType) {
  return { ...options, scale: undefined };
}

export function getColumnScaling(
  column: RemappingHydratedDatasetColumn,
  settings: ComputedVisualizationSettings,
) {
  const columnSettings =
    settings.column?.(column) ?? getColumnSettings(settings, column);
  const scale = columnSettings?.scale;
  return Number.isFinite(scale) ? (scale as number) : 1;
}

export function getHexColor(color: string) {
  // Convert color values to hex format since Apache Batik (SVG renderer used in static visualizations)
  // doesn't support functional color notations like hsla(), rgba(), etc.
  return Color(color).hex();
}
