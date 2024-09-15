import { computeMaxDecimalsForValues } from "metabase/visualizations/lib/utils";
import type {
  ComputedVisualizationSettings,
  RenderingContext,
} from "metabase/visualizations/types";

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
        chartModel.slices.map(s => s.data.normalizedPercentage),
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
