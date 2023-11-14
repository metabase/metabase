import d3 from "d3";
// eslint-disable-next-line no-restricted-imports -- deprecated usage
import moment from "moment-timezone";
import type { RegisteredSeriesOption, EChartsOption } from "echarts";

import { getTrendDataPointsFromInsight } from "metabase/visualizations/lib/trends";
import type {
  ComputedVisualizationSettings,
  RenderingContext,
} from "metabase/visualizations/types";

import { checkNotNull } from "metabase/lib/types";
import type { CartesianChartModel } from "../model/types";

const TREND_LINE_DATA_KEY = "trend-line";

function getSingleSeriesTrendOptionAndDataset(
  index: number,
  chartModel: CartesianChartModel,
  renderingContext: RenderingContext,
): {
  option: RegisteredSeriesOption["line"];
  dataset: EChartsOption["dataset"];
} {
  const insights = checkNotNull(chartModel.insights);

  const xValues = chartModel.dataset.map(row =>
    moment(row[chartModel.dimensionModel.dataKey]),
  );

  const trendDataPoints = getTrendDataPointsFromInsight(
    insights[index],
    d3.extent(xValues),
    xValues.length,
  );
  // TODO handle normalized stacking

  const option: RegisteredSeriesOption["line"] = {
    // TODO styles
    type: "line",
    datasetIndex: index + 2, // TODO make this a constant somehow
    yAxisIndex: 0, // TODO can we remove this?
    encode: {
      x: chartModel.dimensionModel.dataKey,
      y: TREND_LINE_DATA_KEY,
    },
  };

  const dataset: EChartsOption["dataset"] = {
    dimensions: [chartModel.dimensionModel.dataKey, TREND_LINE_DATA_KEY],
    source: trendDataPoints.map(([x, y], i) => ({
      [chartModel.dimensionModel.dataKey]:
        chartModel.dataset[i][chartModel.dimensionModel.dataKey],
      [TREND_LINE_DATA_KEY]: y,
    })),
  };

  return { option, dataset };
}

export function getTrendLineOptionsAndDatasets(
  chartModel: CartesianChartModel,
  settings: ComputedVisualizationSettings,
  renderingContext: RenderingContext,
): {
  options: RegisteredSeriesOption["line"][] | null;
  datasets: EChartsOption["dataset"][] | null;
} {
  if (!settings["graph.show_trendline"]) {
    return { options: null, datasets: null };
  }
  if (chartModel.insights.length !== chartModel.seriesModels.length) {
    throw Error("Number of insight objects does not match number of series");
  }

  // TODO maybe rewrite as for-loop?
  const optionsAndDatasets = chartModel.insights.map((_insight, index) =>
    getSingleSeriesTrendOptionAndDataset(index, chartModel, renderingContext),
  );
  return {
    options: optionsAndDatasets.map(({ option }) => option),
    datasets: optionsAndDatasets.map(({ dataset }) => dataset),
  };
}
