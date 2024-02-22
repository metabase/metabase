import { t } from "ttag";
import dayjs from "dayjs";
import type { RawSeries, RowValue } from "metabase-types/api";
import type {
  ComputedVisualizationSettings,
  RenderingContext,
} from "metabase/visualizations/types";
import type {
  CartesianChartDateTimeAbsoluteUnit,
  ChartDataset,
  DimensionModel,
  TimeSeriesXAxisModel,
  WaterfallXAxisModel,
  XAxisModel,
} from "metabase/visualizations/echarts/cartesian/model/types";

import { getXAxisModel } from "../../model/axis";
import { isTimeSeriesAxis } from "../../model/guards";
import { tryGetDate } from "../../utils/time-series";

const getTotalTimeSeriesXValue = ({
  interval,
  range,
}: TimeSeriesXAxisModel) => {
  const [, lastDate] = range;
  const { unit, count } = interval;

  // @ts-expect-error fix quarter types in dayjs
  return lastDate.add(count, unit).toISOString();
};

export const getWaterfallXAxisModel = (
  dimensionModel: DimensionModel,
  rawSeries: RawSeries,
  dataset: ChartDataset,
  settings: ComputedVisualizationSettings,
  renderingContext: RenderingContext,
): WaterfallXAxisModel => {
  const xAxisModel = getXAxisModel(
    dimensionModel,
    rawSeries,
    dataset,
    settings,
    renderingContext,
  );

  const hasTotal = !!settings["waterfall.show_total"];
  let totalXValue = hasTotal ? t`Total` : undefined;

  let tickRenderPredicate: XAxisModel["tickRenderPredicate"];

  if (isTimeSeriesAxis(xAxisModel) && hasTotal) {
    const timeSeriesTotalXValue = getTotalTimeSeriesXValue(xAxisModel);

    totalXValue = timeSeriesTotalXValue;
    tickRenderPredicate = (tickValueRaw: string) => {
      const tickValue = dayjs(tickValueRaw);
      let tickUnit: CartesianChartDateTimeAbsoluteUnit | undefined;

      // HACK: Due to ECharts default tick selection for weekly and quarterly data
      // we render for each day and month respectively to select the desired ones only.
      // This logic of unit selection should be in sync with `getTimeSeriesXAxisModel` in
      // frontend/src/metabase/visualizations/echarts/cartesian/model/axis.ts
      if (xAxisModel.interval.unit === "week") {
        tickUnit = "day";
      } else if (
        xAxisModel.interval.unit === "month" &&
        xAxisModel.interval.count === 3
      ) {
        tickUnit = "month";
      }

      // @ts-expect-error FIXME: dayjs quarter plugin types
      if (tickValue.isSame(tryGetDate(timeSeriesTotalXValue), tickUnit)) {
        return true;
      }

      return xAxisModel.tickRenderPredicate?.(tickValueRaw) ?? true;
    };
  }

  const waterfallFormatter = (valueRaw: RowValue) => {
    if (
      typeof totalXValue === "undefined" ||
      !isTimeSeriesAxis(xAxisModel) ||
      typeof valueRaw === "boolean"
    ) {
      return xAxisModel.formatter(valueRaw);
    }
    const dateValue = dayjs(valueRaw);

    // @ts-expect-error FIXME: dayjs quarter plugin types
    if (dateValue.isSame(totalXValue, xAxisModel.interval.unit)) {
      return t`Total`;
    }

    return xAxisModel.formatter(valueRaw);
  };

  return {
    ...xAxisModel,
    formatter: waterfallFormatter,
    totalXValue,
    tickRenderPredicate,
  };
};
