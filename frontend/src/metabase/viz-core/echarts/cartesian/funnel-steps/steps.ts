import { formatNumber } from "metabase/utils/formatting";
import { formatValue } from "metabase/value-formatting";

import { getNumberOr } from "../../../lib/settings/row-values";
import type { ComputedVisualizationSettings } from "../../../types";
import { X_AXIS_DATA_KEY } from "../constants/dataset";
import { isCategoryAxis } from "../model/guards";
import type { BaseCartesianChartModel, SeriesModel } from "../model/types";

export type FunnelSteps = {
  seriesModel: SeriesModel;
  stepNames: string[];
  counts: number[];
  formatCount: (value: number, compact?: boolean) => string;
  /** A share as a percent, "" when there's nothing to take it of. */
  formatShare: (part: number, whole: number) => string;
};

/** Each step's name and count, and how the chart formats them. */
export const getFunnelSteps = (
  { seriesModels, transformedDataset, xAxisModel }: BaseCartesianChartModel,
  settings: ComputedVisualizationSettings,
): FunnelSteps | undefined => {
  const [seriesModel] = seriesModels;
  if (!seriesModel || !isCategoryAxis(xAxisModel)) {
    return undefined;
  }

  const columnOptions = {
    column: seriesModel.column,
    ...(settings.column?.(seriesModel.column) ?? {}),
  };

  return {
    seriesModel,
    stepNames: transformedDataset.map((datum) =>
      xAxisModel.formatter(datum[X_AXIS_DATA_KEY]),
    ),
    counts: transformedDataset.map((datum) =>
      getNumberOr(datum[seriesModel.dataKey], 0),
    ),
    formatCount: (value, compact = false) =>
      String(formatValue(value, { ...columnOptions, compact })),
    formatShare: (part, whole) =>
      whole === 0
        ? ""
        : formatNumber(part / whole, {
            number_separators: columnOptions.number_separators,
            number_style: "percent",
            decimals: part === whole || part === 0 ? 0 : 2,
          }),
  };
};
