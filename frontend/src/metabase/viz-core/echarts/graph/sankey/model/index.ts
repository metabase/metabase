import { t } from "ttag";

import { getColorsForValues } from "metabase/ui/colors/charts";
import type { RawSeries } from "metabase-types/api";

import type { ComputedVisualizationSettings } from "../../../../types";

import { getSankeyBreakout } from "./breakout";
import { getSankeyChartColumns, getSankeyData } from "./dataset";
import { getSankeyFormatters } from "./formatters";
import { getPathsSankeyChartModel } from "./paths";
import type { SankeyChartModel } from "./types";

export const getSankeyChartModel = (
  rawSeries: RawSeries,
  settings: ComputedVisualizationSettings,
): SankeyChartModel => {
  const [
    {
      data: { cols },
    },
  ] = rawSeries;

  const sankeyColumns = getSankeyChartColumns(cols, settings);
  if (!sankeyColumns) {
    throw new Error(t`Columns selection is invalid`);
  }
  if (settings["product_analytics.paths"]) {
    return getPathsSankeyChartModel(rawSeries, settings, sankeyColumns);
  }
  const formatters = getSankeyFormatters(sankeyColumns, settings);

  const data = getSankeyData(rawSeries, sankeyColumns, {
    breakout: getSankeyBreakout(rawSeries, settings),
  });

  const nodeColors = getColorsForValues(
    data.nodes.map((node) => String(node.rawName)),
  );

  return {
    data,
    formatters,
    sankeyColumns,
    nodeColors,
  };
};
