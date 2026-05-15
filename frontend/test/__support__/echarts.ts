import type {
  BaseCartesianChartModel,
  BreakoutSeriesModel,
  SeriesModel,
} from "metabase/visualizations/echarts/cartesian/model/types";
import { createMockCard, createMockColumn } from "metabase-types/api/mocks";

export const createMockSeriesModel = (
  opts?: Partial<SeriesModel>,
): SeriesModel => {
  const dataKey = opts?.dataKey ?? "dataKey";
  return {
    dataKey,
    name: `name for ${dataKey}`,
    tooltipName: `tooltip name for ${dataKey}`,
    color: "red",
    legacySeriesSettingsObjectKey: {
      card: { ...createMockCard(), _seriesKey: dataKey },
    },
    vizSettingsKey: dataKey,
    column: createMockColumn({ name: dataKey }),
    columnIndex: 1,
    visible: true,
    ...opts,
  };
};

export const createMockBreakoutSeriesModel = (
  opts?: Partial<BreakoutSeriesModel>,
): BreakoutSeriesModel => ({
  breakoutColumn: createMockColumn({ name: "breakoutColumn" }),
  breakoutColumnIndex: 2,
  breakoutValue: "foo",
  ...createMockSeriesModel(opts),
});

export const createMockCartesianChartModel = (
  opts?: Partial<BaseCartesianChartModel>,
): BaseCartesianChartModel => {
  const column = createMockColumn();
  return {
    dimensionModel: {
      column,
      columnIndex: 0,
      columnByCardId: {},
    },
    seriesModels: [],
    dataset: [],
    transformedDataset: [],
    yAxisScaleTransforms: {
      toEChartsAxisValue: (value) => (typeof value === "number" ? value : null),
      fromEChartsAxisValue: (value) => value,
    },
    stackModels: [],
    leftAxisModel: null,
    rightAxisModel: null,
    xAxisModel: {
      axisType: "category",
      isHistogram: false,
      formatter: String,
      valuesCount: 0,
    },
    columnByDataKey: {},
    seriesLabelsFormatters: {},
    ...opts,
  };
};
