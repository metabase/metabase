import { t } from "ttag";

import type {
  ComputedVisualizationSettings,
  RenderingContext,
} from "metabase/visualizations/types";
import type { RawSeries } from "metabase-types/api";

import { getSankeyChartColumns, getSankeyData } from "./dataset";
import { getSankeyFormatters } from "./formatters";

export const getSankeyChartModel = (
  rawSeries: RawSeries,
  settings: ComputedVisualizationSettings,
  renderingContext: RenderingContext,
) => {
  const [
    {
      data: { cols },
    },
  ] = rawSeries;

  const sankeyColumns = getSankeyChartColumns(cols, settings);
  if (!sankeyColumns) {
    throw new Error(t`Columns selection is invalid`);
  }
  const formatters = getSankeyFormatters(
    sankeyColumns,
    settings,
    renderingContext,
  );

  const data = getSankeyData(rawSeries, sankeyColumns);

  return {
    data,
    formatters,
    sankeyColumns,
  };
};
