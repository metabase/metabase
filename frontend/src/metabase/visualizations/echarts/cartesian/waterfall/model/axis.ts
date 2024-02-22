import { t } from "ttag";
import dayjs from "dayjs";
import type { RawSeries, RowValue } from "metabase-types/api";
import type {
  ComputedVisualizationSettings,
  RenderingContext,
} from "metabase/visualizations/types";
import type {
  ChartDataset,
  DimensionModel,
} from "metabase/visualizations/echarts/cartesian/model/types";

import { X_AXIS_DATA_KEY } from "metabase/visualizations/echarts/cartesian/constants/dataset";
import { getXAxisModel } from "../../model/axis";
import { isTimeSeriesAxis } from "../../model/guards";

export const getWaterfallXAxisModel = (
  dimensionModel: DimensionModel,
  rawSeries: RawSeries,
  dataset: ChartDataset,
  settings: ComputedVisualizationSettings,
  renderingContext: RenderingContext,
) => {
  const xAxisModel = getXAxisModel(
    dimensionModel,
    rawSeries,
    dataset,
    settings,
    renderingContext,
  );

  const waterfallFormatter = (value: RowValue) => {
    const hasTotal = !!settings["waterfall.show_total"];
    const lastXValue = dataset[dataset.length - 1][X_AXIS_DATA_KEY];
    const areBooleanXValues =
      typeof lastXValue === "boolean" || typeof value === "boolean";

    if (!hasTotal || !isTimeSeriesAxis(xAxisModel) || areBooleanXValues) {
      return xAxisModel.formatter(value);
    }
    const dateValue = dayjs(value);

    const totalBucketStart = dayjs(lastXValue).add(
      xAxisModel.interval.count,
      // @ts-expect-error daysjs
      xAxisModel.interval.unit,
    );

    if (
      dateValue.isSame(
        totalBucketStart,
        // @ts-expect-error daysjs
        xAxisModel.interval?.unit,
      )
    ) {
      return t`Total`;
    } else if (
      dateValue.isAfter(
        totalBucketStart,
        // @ts-expect-error daysjs
        xAxisModel.interval?.unit,
      )
    ) {
      // If ECharts decides that tick after the Total value should be rendered
      // we intentionally hide it
      return " ";
    }

    return xAxisModel.formatter(value);
  };

  return {
    ...xAxisModel,
    formatter: waterfallFormatter,
  };
};
