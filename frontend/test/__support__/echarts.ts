import type {
  BaseCartesianChartModel,
  BreakoutSeriesModel,
  ChartBoundsCoords,
  ChartLayout,
  Padding,
  SeriesModel,
  TicksDimensions,
} from "metabase/viz-core";
import { createMockCard, createMockColumn } from "metabase-types/api/mocks";

type MockChartLayoutOpts = Partial<
  Omit<ChartLayout, "ticksDimensions" | "padding" | "bounds">
> & {
  ticksDimensions?: Partial<TicksDimensions>;
  padding?: Partial<Padding>;
  bounds?: Partial<ChartBoundsCoords>;
};

export const createMockChartLayout = (
  opts: MockChartLayoutOpts = {},
): ChartLayout => {
  const { ticksDimensions, padding, bounds, ...rest } = opts;
  return {
    boundaryWidth: 0,
    outerHeight: 0,
    outerWidth: 800,
    padding: { top: 0, left: 0, bottom: 0, right: 0, ...padding },
    bounds: { top: 0, left: 0, bottom: 0, right: 0, ...bounds },
    ticksDimensions: {
      yTicksWidthLeft: 0,
      yTicksWidthRight: 0,
      xTicksHeight: 0,
      xTickWidthCap: 0,
      firstXTickWidth: 0,
      lastXTickWidth: 0,
      getXTickWidth: () => 40,
      ...ticksDimensions,
    },
    axisEnabledSetting: true,
    panelGap: 0,
    ...rest,
  };
};

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
      columns: [column],
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
    cardsColumns: [],
    columnByDataKey: {},
    seriesLabelsFormatters: {},
    ...opts,
  };
};
