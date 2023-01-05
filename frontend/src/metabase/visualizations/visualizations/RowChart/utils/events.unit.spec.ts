import {
  BreakoutChartColumns,
  MultipleMetricsChartColumns,
} from "metabase/visualizations/lib/graph/columns";
import { RemappingHydratedDatasetColumn } from "metabase/visualizations/shared/types/data";
import { getHoverData } from "./events";

const data = [
  { y: "foo", x: 100, x1: 200 },
  { y: "bar", x: 200, x1: 400 },
  { y: "baz", x: 300, x1: 600 },
];

export type TestDatum = { y: string; x: number; x1: number };

const series1 = {
  seriesKey: "series 1",
  seriesName: "Series 1",
  xAccessor: (datum: TestDatum) => datum.x,
  yAccessor: (datum: TestDatum) => datum.y,
};
const series2 = {
  seriesKey: "series 2",
  seriesName: "Series 2",
  xAccessor: (datum: TestDatum) => datum.x1,
  yAccessor: (datum: TestDatum) => datum.y,
};

const seriesColors = {
  "series 1": "red",
  "series 2": "green",
};

const barData = {
  dimensionValue: "2017",
  isNegative: false,
  xStartValue: 0,
  xEndValue: 100,
  yValue: "foo",
  datum: data[0],
  datumIndex: 0,
  series: series1,
  seriesIndex: 0,
};

// export type BreakoutChartColumns = {
//   dimension: ColumnDescriptor;
//   breakout: ColumnDescriptor;
//   metric: ColumnDescriptor;
// };

// export type MultipleMetricsChartColumns = {
//   dimension: ColumnDescriptor;
//   metrics: ColumnDescriptor[];
// };

const breakoutChartColumns: BreakoutChartColumns = {
  dimension: {
    index: 0,
    column: {} as RemappingHydratedDatasetColumn,
  },
  breakout: {
    index: 1,
    column: {} as RemappingHydratedDatasetColumn,
  },
  metric: {
    index: 2,
    column: {} as RemappingHydratedDatasetColumn,
  },
};

const multipleMetricsChartColumns: MultipleMetricsChartColumns = {
  dimension: {
    index: 0,
    column: {} as RemappingHydratedDatasetColumn,
  },
  metrics: [
    {
      index: 1,
      column: {} as RemappingHydratedDatasetColumn,
    },
    {
      index: 2,
      column: {} as RemappingHydratedDatasetColumn,
    },
  ],
};

describe("events utils", () => {
  describe("getHoverData", () => {
    it("sets tooltip model rows", () => {
      const {
        dataTooltip: { headerRows, bodyRows, headerTitle },
      } = getHoverData(
        barData,
        {},
        breakoutChartColumns,
        [series1, series2],
        seriesColors,
      );

      expect(headerTitle).toBe("foo");
      expect(headerRows).toHaveLength(1);
      expect(headerRows[0]).toEqual(
        expect.objectContaining({
          color: "red",
          name: "Series 1",
          value: 100,
        }),
      );
      expect(bodyRows).toHaveLength(1);
      expect(bodyRows[0]).toEqual(
        expect.objectContaining({
          color: "green",
          name: "Series 2",
          value: 200,
        }),
      );
    });

    it("sets showTotal and showPercentages to true for charts with breakouts", () => {
      const {
        dataTooltip: { showTotal, showPercentages },
      } = getHoverData(
        barData,
        {},
        breakoutChartColumns,
        [series1, series2],
        seriesColors,
      );

      expect(showTotal).toBe(true);
      expect(showPercentages).toBe(true);
    });

    it("sets showTotal and showPercentages to false for charts without breakouts", () => {
      const {
        dataTooltip: { showTotal, showPercentages },
      } = getHoverData(
        barData,
        {},
        multipleMetricsChartColumns,
        [series1, series2],
        seriesColors,
      );

      expect(showTotal).toBe(false);
      expect(showPercentages).toBe(false);
    });
  });
});
