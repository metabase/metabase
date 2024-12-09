import type { MultipleMetricsChartColumns } from "metabase/visualizations/lib/graph/columns";
import type {
  BarData,
  Series,
} from "metabase/visualizations/shared/components/RowChart/types";
import type {
  GroupedDatum,
  SeriesInfo,
} from "metabase/visualizations/shared/types/data";
import type {
  RemappingHydratedDatasetColumn,
  TooltipRowModel,
} from "metabase/visualizations/types";
import type { SeriesSettings, VisualizationSettings } from "metabase-types/api";
import { createMockColumn } from "metabase-types/api/mocks";

import { getHoverData, getStackedTooltipRows } from "./events";

const datasetColumns = [
  { name: "y", display_name: "Y" } as RemappingHydratedDatasetColumn,
  { name: "x", display_name: "X" } as RemappingHydratedDatasetColumn,
  { name: "x1", display_name: "X1" } as RemappingHydratedDatasetColumn,
];

const chartColumns: MultipleMetricsChartColumns = {
  dimension: {
    index: 0,
    column: datasetColumns[0],
  },
  metrics: [
    {
      index: 1,
      column: datasetColumns[1],
    },
    {
      index: 2,
      column: datasetColumns[2],
    },
  ],
};

const multipleMetricsData: GroupedDatum[] = [
  {
    dimensionValue: "foo",
    metrics: { x: 100, x1: 200 },
    rawRows: [],
  },
];

const seriesColors = {
  x: "red",
  x1: "green",
};

const series1 = {
  seriesKey: "x",
  seriesName: "Series 1",
  xAccessor: (datum: GroupedDatum) => datum.metrics["x"],
  yAccessor: (datum: GroupedDatum) => datum.dimensionValue,
};
const series2 = {
  seriesKey: "x1",
  seriesName: "Series 2",
  xAccessor: (datum: GroupedDatum) => datum.metrics["x1"],
  yAccessor: (datum: GroupedDatum) => datum.dimensionValue,
};

const barData: BarData<GroupedDatum> = {
  isNegative: false,
  xStartValue: 0,
  xEndValue: 100,
  yValue: "foo",
  datum: multipleMetricsData[0],
  datumIndex: 0,
  series: series1,
  seriesIndex: 0,
};

describe("events utils", () => {
  describe("getHoverData", () => {
    it("returns key-value pairs based on series_settings for charts without a breakout", () => {
      const keyValueData = getHoverData(
        barData,
        {
          series_settings: {
            [chartColumns.metrics[0].column.name]: {
              title: "my custom label",
            } as SeriesSettings,
          },
        },
        {
          dimension: chartColumns.dimension,
          metrics: [chartColumns.metrics[0]],
        },
        datasetColumns,
        [series1],
        seriesColors,
      ).data;

      expect(keyValueData).toStrictEqual([
        { col: chartColumns.dimension.column, key: "Y", value: "foo" },
        {
          col: chartColumns.metrics[0].column,
          key: "my custom label",
          value: 100,
        },
        { col: chartColumns.metrics[1].column, key: "X1", value: 200 },
      ]);
    });

    it.each(["stacked", "normalized"])(
      "returns stacked tooltip model for stacked charts",
      stackType => {
        const tooltipModel = getHoverData(
          barData,
          {
            "stackable.stack_type":
              stackType as VisualizationSettings["stackable.stack_type"],
          },
          chartColumns,
          datasetColumns,
          [series1, series2],
          seriesColors,
        ).stackedTooltipModel;

        const { headerRows, bodyRows, headerTitle } = tooltipModel ?? {};

        expect(headerTitle).toBe("foo");
        expect(headerRows).toHaveLength(1);
        expect(headerRows?.[0]).toEqual(
          expect.objectContaining({
            color: "red",
            name: "Series 1",
            value: 100,
          }),
        );
        expect(bodyRows).toHaveLength(1);
        expect(bodyRows?.[0]).toEqual(
          expect.objectContaining({
            color: "green",
            name: "Series 2",
            value: 200,
          }),
        );
      },
    );

    it("does not return stacked tooltip model for stacked charts with a single metric without a breakout", () => {
      const tooltipModel = getHoverData(
        barData,
        {
          "stackable.stack_type": "stacked",
        },
        {
          dimension: chartColumns.dimension,
          metrics: [chartColumns.metrics[0]],
        },
        datasetColumns,
        [series1],
        seriesColors,
      ).stackedTooltipModel;

      expect(tooltipModel).not.toBeDefined();
    });

    it("does not return stacked tooltip model for non-stacked charts", () => {
      const tooltipModel = getHoverData(
        barData,
        {},
        chartColumns,
        datasetColumns,
        [series1, series1],
        seriesColors,
      ).stackedTooltipModel;

      expect(tooltipModel).not.toBeDefined();
    });
  });
});

describe("getStackedTooltipRows", () => {
  const settings: VisualizationSettings = {};
  const seriesColors = {
    metric1: "red",
    metric2: "blue",
    metric3: "green",
  };

  const createMockSeries = (
    metricKey: string,
    metricName: string,
  ): Series<Record<string, number | null>, SeriesInfo> => ({
    seriesKey: metricKey,
    seriesName: metricName,
    xAccessor: (datum: Record<string, number | null>) => datum[metricKey],
    yAccessor: () => "Category A",
    seriesInfo: {
      metricColumn: createMockColumn({
        name: metricKey,
        display_name: metricName,
      }),
      dimensionColumn: createMockColumn({
        name: "dimension",
        display_name: "Dimension column",
      }),
    },
  });

  const series = [
    createMockSeries("metric1", "Metric 1"),
    createMockSeries("metric2", "Metric 2"),
    createMockSeries("metric3", "Metric 3"),
  ];

  const bar: BarData<Record<string, number | null>, SeriesInfo> = {
    datum: { metric1: 10, metric2: null, metric3: 30 },
    xStartValue: 0,
    xEndValue: 40,
    yValue: "Category A",
    isNegative: false,
    datumIndex: 0,
    seriesIndex: 0,
    series: series[0],
  };

  it("should filter out null values and return formatted rows", () => {
    const result = getStackedTooltipRows(bar, settings, series, seriesColors);

    expect(result).toHaveLength(2);
    expect(result).toEqual([
      expect.objectContaining<Partial<TooltipRowModel>>({
        name: "Metric 1",
        value: 10,
        color: "red",
      }),
      expect.objectContaining<Partial<TooltipRowModel>>({
        name: "Metric 3",
        value: 30,
        color: "green",
      }),
    ]);
  });
});
