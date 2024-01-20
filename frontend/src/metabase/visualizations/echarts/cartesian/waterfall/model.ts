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
  XAxisModel,
  Datum,
} from "metabase/visualizations/echarts/cartesian/model/types";
import dayjs from "dayjs";
import {
  applySquareRootScaling,
  getDatasetExtents,
  replaceValues,
} from "metabase/visualizations/echarts/cartesian/model/dataset";
import { getYAxisModel } from "metabase/visualizations/echarts/cartesian/model/axis";
import { isAbsoluteDateTimeUnit } from "metabase-types/guards/date-time";
import { t } from "ttag";

const getTotalTimeSeriesXValue = (
  lastDimensionValue: string | number,
  xAxisModel: XAxisModel,
) => {
  const { timeSeriesInterval } = xAxisModel;
  if (timeSeriesInterval == null) {
    return null;
  }
  const { interval, count } = timeSeriesInterval;

  if (!isAbsoluteDateTimeUnit(interval)) {
    return null;
  }

  if (interval === "quarter") {
    return dayjs(lastDimensionValue).add(3, "month").toISOString();
  }

  return dayjs(lastDimensionValue).add(count, interval).toISOString();
};

const getWaterfallDataset = (
  chartModel: CartesianChartModel,
  settings: ComputedVisualizationSettings,
  xAxisModel: XAxisModel,
  hasTotal: boolean,
) => {
  const series = chartModel.seriesModels[0];
  const dataset = chartModel.dataset;
  let transformedDataset: ChartDataset = [];
  const dimensionDataKey = chartModel.dimensionModel.dataKey;

  dataset.forEach((datum, index) => {
    const prevDatum = index === 0 ? null : transformedDataset[index - 1];
    const value = datum[series.dataKey];

    const waterfallDatum = {
      [dimensionDataKey]: datum[dimensionDataKey],

      // Number.MIN_VALUE for log scale
      start: prevDatum == null ? Number.MIN_VALUE : prevDatum.end,
      end: prevDatum == null ? value : prevDatum.end + value,
    };

    transformedDataset.push(waterfallDatum);
  });

  if (hasTotal && transformedDataset.length > 0) {
    const lastDatum = transformedDataset[transformedDataset.length - 1];
    const lastValue = lastDatum.end;

    let totalXValue;
    if (
      settings["graph.x_axis.scale"] === "timeseries" &&
      (typeof lastValue === "string" || typeof lastValue === "number")
    ) {
      totalXValue = getTotalTimeSeriesXValue(
        lastDatum[dimensionDataKey] as any,
        xAxisModel,
      );
    } else {
      totalXValue = t`Total`;
    }

    transformedDataset.push({
      [chartModel.dimensionModel.dataKey]: totalXValue,
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

const addTotalDatum = (
  dataset: ChartDataset,
  dimensionDataKey: DataKey,
  waterfallDatasetTotalDatum: Datum,
  seriesDataKey: DataKey,
) => {
  if (dataset.length === 0) {
    return [];
  }

  const lastDatum = dataset[dataset.length - 1];

  let totalDatum: Datum = {
    [seriesDataKey]: waterfallDatasetTotalDatum.end,
    [dimensionDataKey]: t`Total`,
  };

  return [...dataset, totalDatum];
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
    cartesianChartModel.xAxisModel,
    true,
  );

  // Extending the original dataset with the total datum is necessary for the tooltip to work
  const originalDatasetWithTotal = addTotalDatum(
    cartesianChartModel.dataset,
    cartesianChartModel.dimensionModel.dataKey,
    waterfallDataset[waterfallDataset.length - 1],
    cartesianChartModel.seriesModels[0].dataKey,
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

  // const xAxisModel = {
  //   ...cartesianChartModel.xAxisModel.formatter,
  //   formatter: (value: RowValue) => {
  //     if (value === t`Total`) {
  //       return value;
  //     }
  //
  //     if (
  //       settings["graph.x_axis.scale"] === "timeseries" &&
  //       dayjs(value).isSame(
  //         dayjs(
  //           waterfallDataset[waterfallDataset.length - 1][
  //             cartesianChartModel.dimensionModel.dataKey
  //           ],
  //         ),
  //       )
  //     ) {
  //       return t`Total`;
  //     }
  //
  //     return cartesianChartModel.xAxisModel.formatter(value);
  //   },
  // };
  return {
    ...cartesianChartModel,
    seriesModels: [series],
    transformedDataset: waterfallDataset,
    dataset: originalDatasetWithTotal,
    leftYAxisModel,
    // xAxisModel,
    extents,
  };
}
