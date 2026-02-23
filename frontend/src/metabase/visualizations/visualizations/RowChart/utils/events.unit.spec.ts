import type {
  BreakoutChartColumns,
  MultipleMetricsChartColumns,
} from "metabase/visualizations/lib/graph/columns";
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
import {
  createMockColumn,
  createMockNumericColumn,
} from "metabase-types/api/mocks";

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

const SERIES_Y_ACCESSOR = (datum: GroupedDatum) =>
  typeof datum.dimensionValue === "object"
    ? JSON.stringify(datum.dimensionValue)
    : datum.dimensionValue;

const series1 = {
  seriesKey: "x",
  seriesName: "Series 1",
  xAccessor: (datum: GroupedDatum) => datum.metrics["x"],
  yAccessor: SERIES_Y_ACCESSOR,
};
const series2 = {
  seriesKey: "x1",
  seriesName: "Series 2",
  xAccessor: (datum: GroupedDatum) => datum.metrics["x1"],
  yAccessor: SERIES_Y_ACCESSOR,
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
    it("returns dimension key based on axis title setting when set", () => {
      const keyValueData = getHoverData(
        barData,
        {
          "graph.x_axis.title_text": "My Custom Dimension Label",
        },
        {
          dimension: chartColumns.dimension,
          metrics: [chartColumns.metrics[0]],
        },
        datasetColumns,
        [series1],
        seriesColors,
      ).data;

      expect(keyValueData?.[0].key).toBe("My Custom Dimension Label");
    });

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
      (stackType) => {
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

    it("handles breakout where datum has fewer rawRows than seriesIndex (UXW-2597)", () => {
      // Simulates: SELECT 'Production' as stage, 'App1' as application, 'Finished' as status, 2000000 as x
      //            UNION SELECT 'Development', 'App2', 'Finished', 2000000
      // Each dimension value has only one breakout value, but series are created for all breakout values
      const dataWithSparseBreakout: GroupedDatum[] = [
        {
          dimensionValue: "Production",
          metrics: { x: 2000000 },
          isClickable: true,
          rawRows: [["Production", "App1", "Finished", 2000000]],
          breakout: {
            App1: {
              metrics: { x: 2000000 },
              rawRows: [["Production", "App1", "Finished", 2000000]],
            },
          },
        },
        {
          dimensionValue: "Development",
          metrics: { x: 2000000 },
          isClickable: true,
          rawRows: [["Development", "App2", "Finished", 2000000]],
          breakout: {
            App2: {
              metrics: { x: 2000000 },
              rawRows: [["Development", "App2", "Finished", 2000000]],
            },
          },
        },
      ];

      const datasetColumns = [
        createMockColumn({ name: "stage", display_name: "Stage" }),
        createMockColumn({ name: "application", display_name: "Application" }),
        createMockColumn({ name: "status", display_name: "Status" }),
        createMockNumericColumn({ name: "x", display_name: "X" }),
      ];

      const columnsMap = {
        stage: datasetColumns[0],
        application: datasetColumns[1],
        status: datasetColumns[2],
        x: datasetColumns[3],
      };

      const chartColumns: BreakoutChartColumns = {
        dimension: { index: 0, column: columnsMap.stage },
        breakout: { index: 1, column: columnsMap.application },
        metric: { index: 3, column: columnsMap.x },
      };

      const seriesApp1: Series<GroupedDatum, SeriesInfo> = {
        seriesKey: "App1",
        seriesName: "App1",
        seriesInfo: {
          metricColumn: columnsMap.x,
          dimensionColumn: columnsMap.stage,
          breakoutValue: "App1",
        },
        xAccessor: (datum: GroupedDatum) => datum.metrics["x"],
        yAccessor: SERIES_Y_ACCESSOR,
      };

      const seriesApp2: Series<GroupedDatum, SeriesInfo> = {
        seriesKey: "App2",
        seriesName: "App2",
        seriesInfo: {
          metricColumn: columnsMap.x,
          dimensionColumn: columnsMap.stage,
          breakoutValue: "App2",
        },
        xAccessor: (datum: GroupedDatum) => datum.metrics["x"],
        yAccessor: SERIES_Y_ACCESSOR,
      };

      const seriesColors = {
        App1: "#509EE3",
        App2: "#88BF4D",
      };

      // Hover on Development/App2 bar - seriesIndex is 1 but datum.rawRows.length is 1
      const barData: BarData<GroupedDatum> = {
        isNegative: false,
        xStartValue: 0,
        xEndValue: 2000000,
        yValue: "Development",
        datum: dataWithSparseBreakout[1],
        datumIndex: 1,
        series: seriesApp2,
        seriesIndex: 1, // Second series, but datum only has 1 rawRow
      };

      // Should not throw and should return correct status value from breakout-specific rawRows
      const tooltipData = getHoverData(
        barData,
        { "graph.dimensions": ["stage", "application"] },
        chartColumns,
        datasetColumns,
        [seriesApp1, seriesApp2],
        seriesColors,
      );

      expect(tooltipData.data).toBeDefined();
      expect(
        tooltipData.data?.find(({ col }) => col?.name === "status")?.value,
      ).toBe("Finished");
      expect(
        tooltipData.data?.find(({ col }) => col?.name === "x")?.value,
      ).toBe(2000000);
    });

    it("does handle data with breakout correctly (metabase#64931)", () => {
      const dataWithBreakout: GroupedDatum[] = [
        {
          breakout: {
            "2025-03-31": {
              metrics: {
                FUTURESPEND: 1000,
              },
              rawRows: [["2025-03-31", "US", 10, 100, 1000]],
            },
            "2024-03-31": {
              metrics: {
                FUTURESPEND: 2000,
              },
              rawRows: [["2024-03-31", "US", 20, 200, 2000]],
            },
            "2023-03-31": {
              metrics: {
                FUTURESPEND: 6000,
              },
              rawRows: [
                ["2023-03-31", "US", 30, 300, 3000],
                ["2023-03-31", "US", 30, 300, 3000],
              ],
            },
          },
          dimensionValue: "US",
          metrics: { FUTURESPEND: 9000 },
          isClickable: true,
          rawRows: [
            ["2025-03-31", "US", 10, 100, 1000],
            ["2024-03-31", "US", 20, 200, 2000],
            ["2023-03-31", "US", 30, 300, 3000],
            ["2023-03-31", "US", 30, 300, 3000],
          ],
        },
      ];

      const datasetColumns = [
        createMockColumn({
          name: "TIME",
          display_name: "TIME",
        }),
        createMockColumn({
          name: "COUNTRY",
          display_name: "COUNTRY",
        }),
        createMockNumericColumn({
          name: "PERCENTAGEOFTOTALSPEND",
          display_name: "PERCENTAGEOFTOTALSPEND",
        }),
        createMockNumericColumn({
          name: "TOTALSPEND",
          display_name: "TOTALSPEND",
        }),
        createMockNumericColumn({
          name: "FUTURESPEND",
          display_name: "FUTURESPEND",
        }),
      ];

      const COLUMNS_MAP = {
        TIME: datasetColumns[0],
        COUNTRY: datasetColumns[1],
        PERCENTAGEOFTOTALSPEND: datasetColumns[2],
        TOTALSPEND: datasetColumns[3],
        FUTURESPEND: datasetColumns[4],
      };

      const chartColumns: BreakoutChartColumns = {
        dimension: {
          index: 1,
          column: COLUMNS_MAP.COUNTRY,
        },
        breakout: {
          index: 0,
          column: COLUMNS_MAP.TIME,
        },
        metric: {
          index: 4,
          column: COLUMNS_MAP.FUTURESPEND,
        },
      };

      const series0: Series<GroupedDatum, SeriesInfo> = {
        seriesKey: "2025-03-31",
        seriesName: "2025-03-31",
        seriesInfo: {
          metricColumn: COLUMNS_MAP.FUTURESPEND,
          dimensionColumn: COLUMNS_MAP.COUNTRY,
          breakoutValue: "2025-03-31",
        },
        xAccessor: (datum: GroupedDatum) => datum.metrics["FUTURESPEND"],
        yAccessor: SERIES_Y_ACCESSOR,
      };
      const series1: Series<GroupedDatum, SeriesInfo> = {
        seriesKey: "2024-03-31",
        seriesName: "2024-03-31",
        seriesInfo: {
          metricColumn: COLUMNS_MAP.FUTURESPEND,
          dimensionColumn: COLUMNS_MAP.COUNTRY,
          breakoutValue: "2024-03-31",
        },
        xAccessor: (datum: GroupedDatum) => datum.metrics["FUTURESPEND"],
        yAccessor: SERIES_Y_ACCESSOR,
      };
      const series2: Series<GroupedDatum, SeriesInfo> = {
        seriesKey: "2023-03-31",
        seriesName: "2023-03-31",
        seriesInfo: {
          metricColumn: COLUMNS_MAP.FUTURESPEND,
          dimensionColumn: COLUMNS_MAP.COUNTRY,
          breakoutValue: "2023-03-31",
        },
        xAccessor: (datum: GroupedDatum) => datum.metrics["FUTURESPEND"],
        yAccessor: SERIES_Y_ACCESSOR,
      };

      const barData: BarData<GroupedDatum> = {
        isNegative: false,
        xStartValue: 0,
        xEndValue: 6000,
        yValue: "US",
        datum: dataWithBreakout[0],
        datumIndex: 0,
        series: series2,
        seriesIndex: 2,
      };

      const seriesColors = {
        "2023-03-31": "#98D9D9",
        "2024-03-31": "#F2A86F",
        "2025-03-31": "#F9D45C",
      };

      const tooltipData = getHoverData(
        barData,
        {
          "graph.dimensions": ["COUNTRY", "TIME"],
        },
        chartColumns,
        datasetColumns,
        [series0, series1, series2],
        seriesColors,
      );

      expect(
        tooltipData.data?.find(({ col }) => col?.name === "FUTURESPEND")?.value,
      ).toBe(6000);
      expect(
        tooltipData.data?.find(
          ({ col }) => col?.name === "PERCENTAGEOFTOTALSPEND",
        )?.value,
      ).toBe(60);
      expect(
        tooltipData.data?.find(({ col }) => col?.name === "TOTALSPEND")?.value,
      ).toBe(600);
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
