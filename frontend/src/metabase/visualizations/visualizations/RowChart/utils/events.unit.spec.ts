import { VisualizationSettings } from "metabase-types/api";
import { MultipleMetricsChartColumns } from "metabase/visualizations/lib/graph/columns";
import { BarData } from "metabase/visualizations/shared/components/RowChart/types";
import {
  GroupedDatum,
  RemappingHydratedDatasetColumn,
} from "metabase/visualizations/shared/types/data";
import { getHoverData } from "./events";

const datasetColumns = [
  { name: "y" } as RemappingHydratedDatasetColumn,
  { name: "x" } as RemappingHydratedDatasetColumn,
  { name: "x1" } as RemappingHydratedDatasetColumn,
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
