import type {
  BaseCartesianChartModel,
  DataKey,
  Datum,
  SeriesModel,
} from "metabase/visualizations/echarts/cartesian/model/types";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";

const NORMALIZED_STACK_MAX_PERCENT = 100;

type Interval = { min: number; max: number };

const intervalsOverlap = (a: Interval, b: Interval) =>
  a.min < b.max && b.min < a.max;

// A stack accumulates from zero, so it spans [negativeTotal, positiveTotal];
// normalized stacks always span the full 0–100%.
const getStackInterval = (
  datum: Datum,
  seriesKeys: DataKey[],
  isNormalized: boolean,
): Interval | null => {
  const values = seriesKeys
    .map((key) => datum[key])
    .filter((value): value is number => typeof value === "number");

  const hasValue = values.some((value) => value !== 0);
  if (!hasValue) {
    return null;
  }
  if (isNormalized) {
    return { min: 0, max: NORMALIZED_STACK_MAX_PERCENT };
  }

  const positiveTotal = values
    .filter((value) => value > 0)
    .reduce((total, value) => total + value, 0);
  const negativeTotal = values
    .filter((value) => value < 0)
    .reduce((total, value) => total + value, 0);

  return { min: negativeTotal, max: positiveTotal };
};

const getSeriesInterval = (
  value: Datum[DataKey],
  display: string | undefined,
): Interval | null => {
  if (typeof value !== "number") {
    return null;
  }
  // Bars and areas fill from zero
  if (display === "bar" || display === "area") {
    return { min: Math.min(0, value), max: Math.max(0, value) };
  }
  // any other series (a line) marks only its point.
  return { min: value, max: value };
};

const isStackVisible = (
  datum: Datum,
  seriesKeys: DataKey[],
  range: Interval,
  isNormalized: boolean,
) => {
  const interval = getStackInterval(datum, seriesKeys, isNormalized);
  return interval != null && intervalsOverlap(interval, range);
};

const isSeriesVisible = (
  value: Datum[DataKey],
  display: string | undefined,
  range: Interval,
) => {
  const interval = getSeriesInterval(value, display);
  return interval != null && intervalsOverlap(interval, range);
};

export const useAreAllDataPointsOutOfRange = (
  chartModel: BaseCartesianChartModel,
  settings: ComputedVisualizationSettings,
) => {
  if (settings["graph.y_axis.auto_range"]) {
    return false;
  }

  const { "graph.y_axis.min": yMin, "graph.y_axis.max": yMax } = settings;
  if (yMin === undefined || yMax === undefined) {
    return false;
  }

  const windowRange: Interval = { min: yMin, max: yMax };
  const isNormalized = settings["stackable.stack_type"] === "normalized";

  const stackedDataKeys = new Set(
    chartModel.stackModels.flatMap((stackModel) => stackModel.seriesKeys),
  );
  const unstackedSeriesModels = chartModel.seriesModels.filter(
    (seriesModel) => !stackedDataKeys.has(seriesModel.dataKey),
  );

  const getDisplay = (seriesModel: SeriesModel) =>
    settings.series?.(seriesModel.legacySeriesSettingsObjectKey)?.display;

  const isDatumVisible = (datum: Datum) => {
    const stackVisible = chartModel.stackModels.some((stackModel) =>
      isStackVisible(datum, stackModel.seriesKeys, windowRange, isNormalized),
    );
    const seriesVisible = unstackedSeriesModels.some((seriesModel) =>
      isSeriesVisible(
        datum[seriesModel.dataKey],
        getDisplay(seriesModel),
        windowRange,
      ),
    );
    return stackVisible || seriesVisible;
  };

  return !chartModel.dataset.some(isDatumVisible);
};
