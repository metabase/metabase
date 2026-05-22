import { NULL_DISPLAY_VALUE } from "metabase/utils/constants";
import { formatValue } from "metabase/visualizations/lib/formatting";
import { computeMaxDecimalsForValues } from "metabase/visualizations/lib/utils";
import type {
  ComputedVisualizationSettings,
  RemappingHydratedDatasetColumn,
} from "metabase/visualizations/types";
import type { RowValue } from "metabase-types/api";

import type { PieChartModel, SliceTree, SliceTreeNode } from "./model/types";
import { getArrayFromMapValues } from "./util";

export interface PieChartFormatters {
  formatMetric: (value: unknown, isCompact?: boolean) => string;
  formatPercent: (value: unknown, location: "legend" | "chart") => string;
}

function getAllSlicePercentages(sliceTree: SliceTree) {
  const percentages: number[] = [];

  function getPercentages(node: SliceTreeNode) {
    percentages.push(node.normalizedPercentage);
    if (node.isOther) {
      return;
    }

    node.children.forEach((c) => getPercentages(c));
  }
  sliceTree.forEach((node) => getPercentages(node));

  return percentages;
}

export function getPieChartFormatters(
  chartModel: PieChartModel,
  settings: ComputedVisualizationSettings,
): PieChartFormatters {
  const { column: getColumnSettings } = settings;
  if (!getColumnSettings) {
    throw Error("`settings.column` is undefined");
  }

  const metricColSettings = getColumnSettings(
    chartModel.colDescs.metricDesc.column,
  );

  const formatMetric = (value: unknown, isCompact: boolean = false) =>
    String(
      formatValue(value, {
        ...metricColSettings,
        compact: isCompact,
      }),
    );

  const formatPercent = (value: unknown, location: "legend" | "chart") =>
    String(
      formatValue(value, {
        column: metricColSettings.column,
        number_separators: metricColSettings.number_separators as string,
        number_style: "percent",
        decimals: getPiePercentDecimals(chartModel, settings, location),
      }),
    );

  return { formatMetric, formatPercent };
}

/**
 * Number of decimal places used when formatting pie percentages, honoring the
 * `pie.decimal_places` setting and otherwise auto-computing from the slices.
 */
export function getPiePercentDecimals(
  chartModel: PieChartModel,
  settings: ComputedVisualizationSettings,
  location: "legend" | "chart",
): number | undefined {
  const decimals = settings["pie.decimal_places"];
  if (decimals != null) {
    return decimals;
  }

  const percentages =
    location === "chart"
      ? getAllSlicePercentages(chartModel.sliceTree)
      : getArrayFromMapValues(chartModel.sliceTree).map(
          (s) => s.normalizedPercentage,
        );

  return computeMaxDecimalsForValues(percentages, {
    style: "percent",
    maximumSignificantDigits: location === "legend" ? 3 : 2,
  });
}

export function getDimensionFormatter(
  settings: ComputedVisualizationSettings,
  dimensionColumn: RemappingHydratedDatasetColumn,
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

    return String(formatValue(value, dimensionColSettings));
  };
}
