import { NULL_DISPLAY_VALUE } from "metabase/lib/constants";
import { computeMaxDecimalsForValues } from "metabase/visualizations/lib/utils";
import type {
  ComputedVisualizationSettings,
  Formatter,
  RemappingHydratedDatasetColumn,
  RenderingContext,
} from "metabase/visualizations/types";
import type { RowValue } from "metabase-types/api";

import type { PieChartModel } from "./model/types";

export interface PieChartFormatters {
  formatMetric: (value: unknown, isCompact?: boolean) => string;
  formatPercent: (value: unknown, location: "legend" | "chart") => string;
}

export function getPieChartFormatters(
  chartModel: PieChartModel,
  settings: ComputedVisualizationSettings,
  renderingContext: RenderingContext,
): PieChartFormatters {
  const { column: getColumnSettings } = settings;
  if (!getColumnSettings) {
    throw Error("`settings.column` is undefined");
  }

  const metricColSettings = getColumnSettings(
    chartModel.colDescs.metricDesc.column,
  );

  const formatMetric = (value: unknown, isCompact: boolean = false) =>
    renderingContext.formatValue(value, {
      ...metricColSettings,
      compact: isCompact,
    });

  const formatPercent = (value: unknown, location: "legend" | "chart") => {
    let decimals = settings["pie.decimal_places"];
    if (decimals == null) {
      decimals = computeMaxDecimalsForValues(
        // TODO update this to include all values
        Array(...chartModel.sliceTree.values()).map(
          s => s.normalizedPercentage,
        ),
        {
          style: "percent",
          maximumSignificantDigits: location === "legend" ? 3 : 2,
        },
      );
    }

    return renderingContext.formatValue(value, {
      column: metricColSettings.column,
      number_separators: metricColSettings.number_separators as string,
      number_style: "percent",
      decimals,
    });
  };

  return { formatMetric, formatPercent };
}

export function getDimensionFormatter(
  settings: ComputedVisualizationSettings,
  dimensionColumn: RemappingHydratedDatasetColumn,
  formatter: Formatter,
) {
  const getColumnSettings = settings["column"];
  if (!getColumnSettings) {
    throw Error("`settings.column` is undefined");
  }

  const dimensionColSettings = getColumnSettings(dimensionColumn);

  return (value: RowValue) => {
    if (value == null) {
      return NULL_DISPLAY_VALUE;
    }

    return formatter(value, dimensionColSettings);
  };
}
