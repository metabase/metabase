import d3 from "d3";
// eslint-disable-next-line no-restricted-imports -- deprecated usage
import moment from "moment-timezone";
import _ from "underscore";
import Color from "color";
import type { RegisteredSeriesOption, EChartsOption } from "echarts";

import { getTrendDataPointsFromInsight } from "metabase/visualizations/lib/trends";
import type {
  ComputedVisualizationSettings,
  RenderingContext,
} from "metabase/visualizations/types";

import { checkNotNull } from "metabase/lib/types";
import type { CartesianChartModel, GroupedDataset } from "../model/types";

const TREND_LINE_DATA_KEY = "trend-line";

function getSingleSeriesTrendDataset(
  index: number,
  chartModel: CartesianChartModel,
): GroupedDataset {
  const insights = checkNotNull(chartModel.insights); // TODO just make this a param?

  const xValues = chartModel.dataset.map(row =>
    moment(row[chartModel.dimensionModel.dataKey]),
  );
  const trendDataPoints = getTrendDataPointsFromInsight(
    insights[index],
    d3.extent(xValues),
    xValues.length,
  );

  return trendDataPoints.map(([x, y], i) => ({
    [chartModel.dimensionModel.dataKey]:
      chartModel.dataset[i][chartModel.dimensionModel.dataKey],
    [TREND_LINE_DATA_KEY]: y,
  }));
}

function normalizeTrendDatasets(
  trendDatasets: GroupedDataset[],
  settings: ComputedVisualizationSettings,
): GroupedDataset[] {
  if (settings["stackable.stack_type"] !== "normalized") {
    return trendDatasets;
  }

  const totals = _.range(trendDatasets[0].length).map(rowIndex =>
    trendDatasets.reduce(
      (total, trendDataset) =>
        total + (trendDataset[rowIndex][TREND_LINE_DATA_KEY] as number), // TODO better typesafety?
      0,
    ),
  );

  return trendDatasets.map(trendDataset =>
    trendDataset.map((row, rowIndex) => ({
      ...row,
      [TREND_LINE_DATA_KEY]:
        (row[TREND_LINE_DATA_KEY] as number) / totals[rowIndex],
    })),
  );
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

  const options: RegisteredSeriesOption["line"][] = chartModel.insights.map(
    (_, index) => ({
      type: "line",
      datasetIndex: index + 2, // TODO make this a constant somehow
      encode: {
        x: chartModel.dimensionModel.dataKey,
        y: TREND_LINE_DATA_KEY,
      },
      showSymbol: false,
      lineStyle: {
        color: Color(
          renderingContext.getColor(chartModel.seriesModels[index].color),
        )
          .lighten(0.25)
          .hex(), // TODO map on seriesModels instead
        type: [5, 5],
        width: 2,
      },
    }),
  );

  const rawDatasets = chartModel.insights.map((_, index) =>
    getSingleSeriesTrendDataset(index, chartModel),
  );
  const datasets = normalizeTrendDatasets(rawDatasets, settings);

  return {
    options,
    datasets: datasets.map(dataset => ({
      dimensions: [chartModel.dimensionModel.dataKey, TREND_LINE_DATA_KEY],
      source: dataset,
    })),
  };
}
