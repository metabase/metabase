import { NULL_CHAR } from "metabase/visualizations/echarts/cartesian/constants/dataset";
import type { RowValue } from "metabase-types/api";

import type { DataKey } from "../cartesian/model/types";

import type { BoxPlotStat } from "./constants";
import {
  BOXPLOT_BOX_WIDTH_RATIO,
  BOXPLOT_MAX_BOX_WIDTH,
  BOXPLOT_MAX_SYMBOL_SIZE,
  BOXPLOT_MIN_BOX_WIDTH,
  BOXPLOT_MIN_SYMBOL_SIZE,
  BOXPLOT_SYMBOL_SIZE_RATIO,
  DATA_POINTS_SERIES_NAME,
  MEAN_SERIES_NAME,
  OUTLIERS_SERIES_NAME,
  SIDE_LABELS_MIN_GAP_RATIO,
} from "./constants";

export type LabelLayoutMode = "side" | "vertical";

export const getBoxPlotBoxWidth = (categoryWidth: number): number => {
  const rawBoxWidth = categoryWidth * BOXPLOT_BOX_WIDTH_RATIO;
  return Math.max(
    BOXPLOT_MIN_BOX_WIDTH,
    Math.min(rawBoxWidth, BOXPLOT_MAX_BOX_WIDTH),
  );
};

export const getBoxPlotSymbolSize = (categoryWidth: number): number => {
  const rawSymbolSize = categoryWidth * BOXPLOT_SYMBOL_SIZE_RATIO;
  return Math.max(
    BOXPLOT_MIN_SYMBOL_SIZE,
    Math.min(rawSymbolSize, BOXPLOT_MAX_SYMBOL_SIZE),
  );
};

export const getLabelLayoutMode = (categoryWidth: number): LabelLayoutMode => {
  const boxWidth = getBoxPlotBoxWidth(categoryWidth);
  const gap = categoryWidth - boxWidth;
  return gap >= SIDE_LABELS_MIN_GAP_RATIO * boxWidth ? "side" : "vertical";
};

/**
 * Computes pixel offset from category center for a series in a multi-series boxplot.
 * This matches ECharts boxplot layout algorithm exactly (from boxplotLayout.js):
 *   availableWidth = bandWidth * 0.8 - 2
 *   boxGap = availableWidth / seriesCount * 0.3
 *   boxWidth = (availableWidth - boxGap * (seriesCount - 1)) / seriesCount
 *   offset = boxWidth/2 - availableWidth/2 + seriesIndex * (boxGap + boxWidth)
 */
export const computeSeriesXOffsetPixels = (
  categoryWidth: number,
  seriesIndex: number,
  seriesCount: number,
): number => {
  if (seriesCount <= 1) {
    return 0;
  }
  const availableWidth = categoryWidth * 0.8 - 2;
  const boxGap = (availableWidth / seriesCount) * 0.3;
  const seriesBoxWidth =
    (availableWidth - boxGap * (seriesCount - 1)) / seriesCount;
  const step = boxGap + seriesBoxWidth;
  const base = seriesBoxWidth / 2 - availableWidth / 2;
  return base + seriesIndex * step;
};

export const getBoxPlotStatKey = (
  seriesDataKey: DataKey,
  stat: BoxPlotStat,
): DataKey => `${seriesDataKey}${NULL_CHAR}${stat}`;

export const getSeriesXValueKey = (
  seriesKey: DataKey,
  xValue: RowValue,
): string => `${seriesKey}${NULL_CHAR}${String(xValue)}`;

export const getOutliersSeriesName = (dataKey: DataKey): string =>
  `${OUTLIERS_SERIES_NAME}_${dataKey}`;

export const getDataPointsSeriesName = (dataKey: DataKey): string =>
  `${DATA_POINTS_SERIES_NAME}_${dataKey}`;

export const getMeanSeriesName = (dataKey: DataKey): string =>
  `${MEAN_SERIES_NAME}_${dataKey}`;

const SCATTER_SERIES_PREFIXES = [
  `${OUTLIERS_SERIES_NAME}_`,
  `${DATA_POINTS_SERIES_NAME}_`,
  `${MEAN_SERIES_NAME}_`,
];

const POINT_SERIES_PREFIXES = [
  `${OUTLIERS_SERIES_NAME}_`,
  `${DATA_POINTS_SERIES_NAME}_`,
];

export const isBoxPlotScatterSeriesName = (seriesName: string): boolean =>
  SCATTER_SERIES_PREFIXES.some((prefix) => seriesName.startsWith(prefix));

export const isPointSeriesName = (seriesName: string | undefined): boolean =>
  seriesName != null &&
  POINT_SERIES_PREFIXES.some((prefix) => seriesName.startsWith(prefix));

export const isMeanSeriesName = (seriesName: string | undefined): boolean =>
  seriesName != null && seriesName.startsWith(`${MEAN_SERIES_NAME}_`);

export const extractSeriesDataKeyFromName = (
  seriesName: string,
): DataKey | null => {
  const matchingPrefix = SCATTER_SERIES_PREFIXES.find((prefix) =>
    seriesName.startsWith(prefix),
  );
  return matchingPrefix ? seriesName.slice(matchingPrefix.length) : null;
};
