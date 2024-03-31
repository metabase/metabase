import dayjs from "dayjs";
import { t } from "ttag";

import type {
  ChartDataset,
  DateRange,
  DimensionModel,
  Extent,
  TimeSeriesXAxisModel,
  WaterfallXAxisModel,
} from "metabase/visualizations/echarts/cartesian/model/types";
import type {
  ComputedVisualizationSettings,
  RenderingContext,
} from "metabase/visualizations/types";
import type { RawSeries, RowValue } from "metabase-types/api";

import { getXAxisModel } from "../../model/axis";
import { isNumericAxis, isTimeSeriesAxis } from "../../model/guards";
import { tryGetDate } from "../../utils/timeseries";

const getTotalTimeSeriesXValue = ({
  interval,
  range,
}: TimeSeriesXAxisModel) => {
  const [, lastDate] = range;
  const { unit, count } = interval;
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
  if (!hasTotal) {
    return xAxisModel;
  }

  if (isTimeSeriesAxis(xAxisModel)) {
    const totalXValue = getTotalTimeSeriesXValue(xAxisModel);
    const range: DateRange = [xAxisModel.range[0], dayjs(totalXValue)];
    const intervalsCount = xAxisModel.intervalsCount;
    const formatter = (valueRaw: RowValue) => {
      const dateValue = tryGetDate(valueRaw);
      if (dateValue == null) {
        return "";
      }

      if (dateValue.isSame(dayjs(totalXValue), xAxisModel.interval.unit)) {
        return t`Total`;
      }

      return xAxisModel.formatter(valueRaw);
    };

    return {
      ...xAxisModel,
      range,
      intervalsCount,
      totalXValue,
      formatter,
    };
  }

  if (isNumericAxis(xAxisModel)) {
    const totalXValue = xAxisModel.extent[1] + xAxisModel.interval;
    const extent: Extent = [xAxisModel.extent[0], totalXValue];
    const formatter = (valueRaw: RowValue) => {
      if (valueRaw === totalXValue) {
        return t`Total`;
      }

      return xAxisModel.formatter(valueRaw);
    };

    return {
      ...xAxisModel,
      totalXValue,
      extent,
      formatter,
    };
  }

  const totalXValue = t`Total`;
  return {
    ...xAxisModel,
    totalXValue,
  };
};
