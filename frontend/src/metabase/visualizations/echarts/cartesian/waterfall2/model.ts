import type { RawSeries, RowValue } from "metabase-types/api";
import type {
  ComputedVisualizationSettings,
  RenderingContext,
} from "metabase/visualizations/types";
import { getCartesianChartModel } from "metabase/visualizations/echarts/cartesian/model";
import type {
  CartesianChartModel,
  DataKey,
  ChartDataset,
} from "metabase/visualizations/echarts/cartesian/model/types";
import dayjs from "dayjs";
import {
  applySquareRootScaling,
  getDatasetExtents,
  replaceValues,
} from "metabase/visualizations/echarts/cartesian/model/dataset";
import { getYAxisModel } from "metabase/visualizations/echarts/cartesian/model/axis";

const getWaterfallDataset = (
  chartModel: CartesianChartModel,
  settings: ComputedVisualizationSettings,
  hasTotal: boolean,
) => {
  const series = chartModel.seriesModels[0];
  const dataset = chartModel.dataset;
  let transformedDataset: ChartDataset = [];

  dataset.forEach((datum, index) => {
    const prevDatum = index === 0 ? null : transformedDataset[index - 1];
    const value = datum[series.dataKey];

    const waterfallDatum = {
      [chartModel.dimensionModel.dataKey]:
        datum[chartModel.dimensionModel.dataKey],

      // Number.MIN_VALUE for log scale
      start: prevDatum == null ? Number.MIN_VALUE : prevDatum.end,
      end: prevDatum == null ? value : prevDatum.end + value,
    };

    transformedDataset.push(waterfallDatum);
  });

  if (hasTotal && transformedDataset.length > 0) {
    const lastDatum = transformedDataset[transformedDataset.length - 1];

    transformedDataset.push({
      [chartModel.dimensionModel.dataKey]: dayjs(
        lastDatum[chartModel.dimensionModel.dataKey],
      )
        .add(1, "year")
        .format("YYYY-MM-DD"),
      start: Number.MIN_VALUE,
      end: lastDatum.end,
      isTotal: true,
    });
  }

  if (settings["graph.y_axis.scale"] === "pow") {
    transformedDataset = replaceValues(
      transformedDataset,
      (dataKey: DataKey, value: RowValue) =>
        ["start", "end"].includes(dataKey)
          ? applySquareRootScaling(value)
          : value,
    );
  }

  return transformedDataset;
};

export function getWaterfallChartModel(
  rawSeries: RawSeries,
  settings: ComputedVisualizationSettings,
  renderingContext: RenderingContext,
) {
  const cartesianChartModel = getCartesianChartModel(
    rawSeries,
    settings,
    renderingContext,
  );

  const waterfallDataset = getWaterfallDataset(
    cartesianChartModel,
    settings,
    true,
  );

  const extents = getDatasetExtents(["start"], waterfallDataset);

  const leftYAxisModel = getYAxisModel(
    ["start"],
    waterfallDataset,
    settings,
    cartesianChartModel.columnByDataKey,
    renderingContext,
  );

  const series = {
    ...cartesianChartModel.seriesModels[0],
    dataKey: "end",
  };

  return {
    ...cartesianChartModel,
    seriesModels: [series],
    transformedDataset: waterfallDataset,
    leftYAxisModel,
    extents,
  };
}
