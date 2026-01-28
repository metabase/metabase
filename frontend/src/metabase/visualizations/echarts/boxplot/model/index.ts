import { memoize } from "metabase/common/hooks/use-memoized-callback";
import { NULL_DISPLAY_VALUE } from "metabase/lib/constants";
import { formatValue } from "metabase/lib/formatting";
import {
  ECHARTS_CATEGORY_AXIS_NULL_VALUE,
  X_AXIS_DATA_KEY,
} from "metabase/visualizations/echarts/cartesian/constants/dataset";
import {
  computeSplit,
  getYAxisModel,
  shouldAutoSplitYAxis,
} from "metabase/visualizations/echarts/cartesian/model/axis";
import {
  getCardsColumnByDataKeyMap,
  getDatasetKey,
  getSortedSeriesModels,
  sortDataset,
} from "metabase/visualizations/echarts/cartesian/model/dataset";
import {
  getCardSeriesModels,
  getDimensionModel,
} from "metabase/visualizations/echarts/cartesian/model/series";
import { getAxisTransforms } from "metabase/visualizations/echarts/cartesian/model/transforms";
import type {
  CategoryXAxisModel,
  ChartDataset,
  DataKey,
  Datum,
  Extent,
  LabelFormatter,
  SeriesExtents,
  SeriesFormatters,
  YAxisModel,
} from "metabase/visualizations/echarts/cartesian/model/types";
import type { ShowWarning } from "metabase/visualizations/echarts/types";
import type { CartesianChartColumns } from "metabase/visualizations/lib/graph/columns";
import { getCartesianChartColumns } from "metabase/visualizations/lib/graph/columns";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import type {
  DatasetColumn,
  RawSeries,
  RowValue,
  XAxisScale,
} from "metabase-types/api";

import { computeMultiSeriesBoxPlotData } from "./dataset";
import type {
  BoxPlotChartModel,
  BoxPlotDatum,
  BoxPlotLabelFrequency,
  BoxPlotPointsMode,
  BoxPlotSeriesModel,
  BoxPlotShowValuesMode,
  BoxPlotWhiskerType,
} from "./types";

interface BoxPlotDisplaySettings {
  whiskerType: BoxPlotWhiskerType;
  pointsMode: BoxPlotPointsMode;
  showMean: boolean;
}

interface BoxPlotLabelSettings {
  showValuesMode: BoxPlotShowValuesMode | null;
  seriesLabelsFormatters: SeriesFormatters;
  labelFrequency: BoxPlotLabelFrequency;
}

const getBoxPlotSortScale = (
  settings: ComputedVisualizationSettings,
): XAxisScale => {
  if (settings["graph.x_axis._is_timeseries"]) {
    return "timeseries";
  }
  if (settings["graph.x_axis._is_numeric"]) {
    return "linear";
  }
  return "ordinal";
};

const createLabelFormatter = (
  metricColumn: DatasetColumn | undefined,
  settings: ComputedVisualizationSettings,
): LabelFormatter => {
  const columnSettings = metricColumn
    ? (settings.column?.(metricColumn) ?? {})
    : {};
  const formatting = settings["graph.label_value_formatting"];

  return memoize((value: RowValue) => {
    if (typeof value !== "number") {
      return "";
    }
    return String(
      formatValue(value, {
        column: metricColumn,
        ...columnSettings,
        jsx: false,
        compact: formatting === "compact",
      }),
    );
  });
};

const getBoxPlotDataset = (
  rawSeries: RawSeries,
  chartColumns: CartesianChartColumns,
): ChartDataset => {
  const hasBreakout = "breakout" in chartColumns;
  const breakoutIndex = hasBreakout ? chartColumns.breakout.index : -1;
  const dimensionIndex = chartColumns.dimension.index;

  return rawSeries.flatMap(({ card, data: { rows, cols } }) => {
    const precomputedKeys = hasBreakout
      ? null
      : cols.map((col) => getDatasetKey(col, card.id));

    return rows.map((row) => {
      const datum: Datum = { [X_AXIS_DATA_KEY]: row[dimensionIndex] };
      const breakoutValue = hasBreakout ? row[breakoutIndex] : undefined;

      for (let i = 0; i < cols.length; i++) {
        const key = precomputedKeys
          ? precomputedKeys[i]
          : getDatasetKey(cols[i], card.id, breakoutValue);
        datum[key] = row[i];
      }

      return datum;
    });
  });
};

const getDisplaySettings = (
  settings: ComputedVisualizationSettings,
): BoxPlotDisplaySettings => ({
  whiskerType: settings["boxplot.whisker_type"]!,
  pointsMode: settings["boxplot.points_mode"]!,
  showMean: settings["boxplot.show_mean"]!,
});

const getLabelSettings = (
  settings: ComputedVisualizationSettings,
  seriesModels: BoxPlotSeriesModel[],
): BoxPlotLabelSettings => {
  const showValues = settings["graph.show_values"]!;

  const seriesLabelsFormatters: SeriesFormatters = {};
  if (showValues) {
    seriesModels.forEach((seriesModel) => {
      seriesLabelsFormatters[seriesModel.dataKey] = createLabelFormatter(
        seriesModel.column,
        settings,
      );
    });
  }

  return {
    showValuesMode: showValues ? settings["boxplot.show_values_mode"]! : null,
    seriesLabelsFormatters,
    labelFrequency: settings["graph.label_value_frequency"]!,
  };
};

const computeSeriesExtent = (
  xValueMap: Map<RowValue, BoxPlotDatum>,
): Extent | null => {
  let minY = Infinity;
  let maxY = -Infinity;

  for (const datum of xValueMap.values()) {
    minY = Math.min(minY, datum.min, datum.mean);
    maxY = Math.max(maxY, datum.max, datum.mean);

    for (const outlier of datum.outliers) {
      minY = Math.min(minY, outlier);
      maxY = Math.max(maxY, outlier);
    }
  }

  if (!Number.isFinite(minY) || !Number.isFinite(maxY)) {
    return null;
  }
  return [minY, maxY];
};

const computeBoxPlotSeriesExtents = (
  dataBySeriesAndXValue: Map<DataKey, Map<RowValue, BoxPlotDatum>>,
): SeriesExtents => {
  const extents: SeriesExtents = {};

  for (const [dataKey, xValueMap] of dataBySeriesAndXValue) {
    const extent = computeSeriesExtent(xValueMap);
    if (extent) {
      extents[dataKey] = extent;
    }
  }

  return extents;
};

const computeCombinedExtent = (
  extents: SeriesExtents,
  dataKeys: DataKey[],
): Extent => {
  let minY = Infinity;
  let maxY = -Infinity;

  dataKeys.forEach((dataKey) => {
    const extent = extents[dataKey];
    if (extent) {
      if (extent[0] < minY) {
        minY = extent[0];
      }
      if (extent[1] > maxY) {
        maxY = extent[1];
      }
    }
  });

  return [Number.isFinite(minY) ? minY : 0, Number.isFinite(maxY) ? maxY : 100];
};

const createXAxisFormatter = (
  dimensionColumn: DatasetColumn | undefined,
  settings: ComputedVisualizationSettings,
): ((value: RowValue) => string) => {
  const columnSettings =
    dimensionColumn != null ? (settings.column?.(dimensionColumn) ?? {}) : {};

  return (value: RowValue) => {
    if (value == null || value === ECHARTS_CATEGORY_AXIS_NULL_VALUE) {
      return NULL_DISPLAY_VALUE;
    }

    return String(
      formatValue(value, {
        column: dimensionColumn,
        ...columnSettings,
        compact: settings["graph.x_axis.axis_enabled"] === "compact",
      }),
    );
  };
};

const createXAxisModel = (
  dimensionColumn: DatasetColumn | undefined,
  xValuesCount: number,
  settings: ComputedVisualizationSettings,
): CategoryXAxisModel => ({
  axisType: "category",
  label: dimensionColumn?.display_name,
  isHistogram: false,
  formatter: createXAxisFormatter(dimensionColumn, settings),
  valuesCount: xValuesCount,
  canBrush: false,
});

const getYAxisSplit = (
  seriesModels: BoxPlotSeriesModel[],
  seriesExtents: SeriesExtents,
  settings: ComputedVisualizationSettings,
): [Set<DataKey>, Set<DataKey>] => {
  const left: DataKey[] = [];
  const right: DataKey[] = [];
  const auto: DataKey[] = [];

  seriesModels.forEach((seriesModel) => {
    const seriesSettings = settings.series(
      seriesModel.legacySeriesSettingsObjectKey,
    );
    const axis = seriesSettings?.axis;

    if (axis === "left") {
      left.push(seriesModel.dataKey);
    } else if (axis === "right") {
      right.push(seriesModel.dataKey);
    } else {
      auto.push(seriesModel.dataKey);
    }
  });

  if (!shouldAutoSplitYAxis(settings, seriesModels, seriesExtents)) {
    return [new Set([...left, ...auto]), new Set(right)];
  }

  const [autoLeft, autoRight] = computeSplit(seriesExtents, left, right);
  return [new Set(autoLeft), new Set(autoRight)];
};

type BoxPlotYAxesModels = {
  leftAxisModel: YAxisModel | null;
  rightAxisModel: YAxisModel | null;
  leftAxisSeriesKeys: Set<DataKey>;
  rightAxisSeriesKeys: Set<DataKey>;
};

const createBoxPlotYAxisModel = (
  dataKeys: DataKey[],
  names: string[],
  dataset: ChartDataset,
  settings: ComputedVisualizationSettings,
  columnByDataKey: Record<string, DatasetColumn>,
  seriesExtents: SeriesExtents,
  yAxisScaleTransforms: ReturnType<typeof getAxisTransforms>,
): YAxisModel | null => {
  if (dataKeys.length === 0) {
    return null;
  }

  const yAxisModel = getYAxisModel(
    dataKeys,
    names,
    dataset,
    settings,
    columnByDataKey,
  );

  if (yAxisModel) {
    const [minY, maxY] = computeCombinedExtent(seriesExtents, dataKeys);
    const transformedMinY = yAxisScaleTransforms.toEChartsAxisValue(minY);
    const transformedMaxY = yAxisScaleTransforms.toEChartsAxisValue(maxY);
    yAxisModel.extent = [transformedMinY ?? minY, transformedMaxY ?? maxY];
  }

  return yAxisModel;
};

const getBoxPlotYAxesModels = (
  seriesModels: BoxPlotSeriesModel[],
  dataBySeriesAndXValue: Map<DataKey, Map<RowValue, BoxPlotDatum>>,
  rawDataset: ChartDataset,
  settings: ComputedVisualizationSettings,
  columnByDataKey: Record<string, DatasetColumn>,
  yAxisScaleTransforms: ReturnType<typeof getAxisTransforms>,
): BoxPlotYAxesModels => {
  const seriesExtents = computeBoxPlotSeriesExtents(dataBySeriesAndXValue);
  const [leftAxisSeriesKeys, rightAxisSeriesKeys] = getYAxisSplit(
    seriesModels,
    seriesExtents,
    settings,
  );

  const visibleLeftKeys: DataKey[] = [];
  const visibleLeftNames: string[] = [];
  const visibleRightKeys: DataKey[] = [];
  const visibleRightNames: string[] = [];

  seriesModels.forEach(({ dataKey, visible, name }) => {
    if (!visible) {
      return;
    }
    if (leftAxisSeriesKeys.has(dataKey)) {
      visibleLeftKeys.push(dataKey);
      visibleLeftNames.push(name);
    } else if (rightAxisSeriesKeys.has(dataKey)) {
      visibleRightKeys.push(dataKey);
      visibleRightNames.push(name);
    }
  });

  return {
    leftAxisModel: createBoxPlotYAxisModel(
      visibleLeftKeys,
      visibleLeftNames,
      rawDataset,
      settings,
      columnByDataKey,
      seriesExtents,
      yAxisScaleTransforms,
    ),
    rightAxisModel: createBoxPlotYAxisModel(
      visibleRightKeys,
      visibleRightNames,
      rawDataset,
      settings,
      columnByDataKey,
      seriesExtents,
      yAxisScaleTransforms,
    ),
    leftAxisSeriesKeys,
    rightAxisSeriesKeys,
  };
};

export const getBoxPlotModel = (
  rawSeries: RawSeries,
  settings: ComputedVisualizationSettings,
  hiddenSeries: string[] = [],
  showWarning?: ShowWarning,
): BoxPlotChartModel => {
  const [singleRawSeries] = rawSeries;
  const { data } = singleRawSeries;

  const chartColumns = getCartesianChartColumns(data.cols, settings);
  const cardsColumns = [chartColumns];
  const columnByDataKey = getCardsColumnByDataKeyMap(rawSeries, cardsColumns);
  const dimensionModel = getDimensionModel(rawSeries, cardsColumns);

  const unsortedSeriesModels = getCardSeriesModels(
    singleRawSeries,
    chartColumns,
    hiddenSeries,
    false,
    false,
    settings,
  );
  const seriesModels: BoxPlotSeriesModel[] = getSortedSeriesModels(
    unsortedSeriesModels,
    settings,
  );

  const unsortedDataset = getBoxPlotDataset(rawSeries, chartColumns);
  const sortScale = getBoxPlotSortScale(settings);
  const rawDataset = sortDataset(unsortedDataset, sortScale, showWarning);

  const displaySettings = getDisplaySettings(settings);
  const yAxisScaleTransforms = getAxisTransforms(
    settings["graph.y_axis.scale"],
  );

  const boxPlotData =
    seriesModels.length > 0
      ? computeMultiSeriesBoxPlotData(
          rawDataset,
          X_AXIS_DATA_KEY,
          seriesModels,
          displaySettings.whiskerType,
          yAxisScaleTransforms,
        )
      : null;

  const dataBySeriesAndXValue = boxPlotData?.dataBySeriesAndXValue ?? new Map();
  const xValues = boxPlotData?.xValues ?? [];
  const boxDataset = boxPlotData?.boxDataset ?? [];
  const outlierAbovePointsDataset =
    boxPlotData?.outlierAbovePointsDataset ?? [];
  const outlierBelowPointsDataset =
    boxPlotData?.outlierBelowPointsDataset ?? [];
  const nonOutlierPointsDataset = boxPlotData?.nonOutlierPointsDataset ?? [];

  const labelSettings = getLabelSettings(settings, seriesModels);

  const {
    leftAxisModel,
    rightAxisModel,
    leftAxisSeriesKeys,
    rightAxisSeriesKeys,
  } = getBoxPlotYAxesModels(
    seriesModels,
    dataBySeriesAndXValue,
    rawDataset,
    settings,
    columnByDataKey,
    yAxisScaleTransforms,
  );

  const breakoutColumn =
    "breakout" in chartColumns ? chartColumns.breakout.column : undefined;

  return {
    boxDataset,
    outlierAbovePointsDataset,
    outlierBelowPointsDataset,
    nonOutlierPointsDataset,
    dataBySeriesAndXValue,
    xValues,
    seriesModels,
    yAxisScaleTransforms,
    columnByDataKey,
    dimensionModel,
    breakoutColumn,
    xAxisModel: createXAxisModel(
      dimensionModel.column,
      xValues.length,
      settings,
    ),
    leftAxisModel,
    rightAxisModel,
    leftAxisSeriesKeys,
    rightAxisSeriesKeys,
    ...displaySettings,
    ...labelSettings,
  };
};
