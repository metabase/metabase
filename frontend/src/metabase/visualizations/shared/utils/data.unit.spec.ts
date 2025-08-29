import type {
  BreakoutChartColumns,
  MultipleMetricsChartColumns,
} from "metabase/visualizations/lib/graph/columns";
import type { ColumnFormatter } from "metabase/visualizations/shared/types/format";
import {
  createMockColumn,
  createMockVisualizationSettings,
} from "metabase-types/api/mocks";

import { getGroupedDataset } from "./data";

const columnFormatter: ColumnFormatter = (value: any) => String(value);

const dimensionColumn = createMockColumn({ name: "year" });
const breakoutColumn = createMockColumn({ name: "category" });
const otherBreakoutColumn = createMockColumn({ name: "rating" });
const countMetricColumn = createMockColumn({
  base_type: "type/Number",
  name: "count",
});
const avgMetricColumn = createMockColumn({
  base_type: "type/Number",
  name: "avg",
});

const rows = [
  [2020, "Doohickey", 400, 90],
  [2020, "Gadget", 450, 100],
  [2021, "Doohickey", 500, 110],
  [2021, "Gadget", 550, 120],
];

const rowsWithMultipleBreakouts = [
  [2020, "Doohickey", 400, 90],
  [2020, "Doohickey", 450, 100],
  [2020, "Gadget", 500, 90],
  [2021, "Doohickey", 550, 110],
  [2021, "Gadget", 600, 120],
  [2021, "Gadget", 650, 120],
];

const breakoutChartColumns: BreakoutChartColumns = {
  dimension: {
    column: dimensionColumn,
    index: 0,
  },
  breakout: {
    breakoutDimensions: [{ index: 1, column: breakoutColumn }],
  },
  metric: {
    column: countMetricColumn,
    index: 2,
  },
};

const multipleBreakoutChartColumns: BreakoutChartColumns = {
  dimension: {
    column: dimensionColumn,
    index: 0,
  },
  breakout: {
    breakoutDimensions: [
      { index: 1, column: breakoutColumn },
      { index: 3, column: otherBreakoutColumn },
    ],
  },
  metric: {
    column: countMetricColumn,
    index: 2,
  },
};

const multipleMetricsChartColumns: MultipleMetricsChartColumns = {
  dimension: {
    column: dimensionColumn,
    index: 0,
  },
  metrics: [
    {
      column: countMetricColumn,
      index: 2,
    },
    {
      column: avgMetricColumn,
      index: 3,
    },
  ],
};

describe("data utils", () => {
  describe("getGroupedDataset", () => {
    describe("chart with multiple metrics", () => {
      it("should group dataset by dimension values", () => {
        const groupedData = getGroupedDataset(
          rows,
          multipleMetricsChartColumns,
          createMockVisualizationSettings({ column: () => {} }),
          columnFormatter,
        );

        expect(groupedData).toStrictEqual([
          {
            dimensionValue: 2020,
            isClickable: true,
            metrics: {
              count: 850,
              avg: 190,
            },
            rawRows: [rows[0], rows[1]],
          },
          {
            dimensionValue: 2021,
            isClickable: true,
            metrics: {
              count: 1050,
              avg: 230,
            },
            rawRows: [rows[2], rows[3]],
          },
        ]);
      });
    });
  });

  describe("chart with a breakout", () => {
    it("should group dataset by dimension values and breakout", () => {
      const groupedData = getGroupedDataset(
        rows,
        breakoutChartColumns,
        createMockVisualizationSettings({ column: () => {} }),
        columnFormatter,
      );

      expect(groupedData).toStrictEqual([
        {
          dimensionValue: 2020,
          isClickable: true,
          metrics: {
            count: 850,
          },
          rawRows: [rows[0], rows[1]],
          breakout: {
            Doohickey: {
              metrics: {
                count: 400,
              },
              rawRows: [rows[0]],
            },
            Gadget: {
              metrics: {
                count: 450,
              },
              rawRows: [rows[1]],
            },
          },
        },
        {
          dimensionValue: 2021,
          isClickable: true,
          metrics: {
            count: 1050,
          },
          rawRows: [rows[2], rows[3]],
          breakout: {
            Doohickey: {
              metrics: {
                count: 500,
              },
              rawRows: [rows[2]],
            },
            Gadget: {
              metrics: {
                count: 550,
              },
              rawRows: [rows[3]],
            },
          },
        },
      ]);
    });
  });

  describe("chart with multiple breakouts", () => {
    it("should group dataset by dimension values and multiple breakouts", () => {
      const groupedData = getGroupedDataset(
        rowsWithMultipleBreakouts,
        multipleBreakoutChartColumns,
        createMockVisualizationSettings({ column: () => {} }),
        columnFormatter,
      );

      expect(groupedData).toStrictEqual([
        {
          dimensionValue: 2020,
          isClickable: true,
          metrics: {
            count: 1350,
          },
          rawRows: [
            rowsWithMultipleBreakouts[0],
            rowsWithMultipleBreakouts[1],
            rowsWithMultipleBreakouts[2],
          ],
          breakout: {
            "Doohickey - 90": {
              metrics: { count: 400 },
              rawRows: [rowsWithMultipleBreakouts[0]],
            },
            "Doohickey - 100": {
              metrics: { count: 450 },
              rawRows: [rowsWithMultipleBreakouts[1]],
            },
            "Gadget - 90": {
              metrics: { count: 500 },
              rawRows: [rowsWithMultipleBreakouts[2]],
            },
          },
        },
        {
          dimensionValue: 2021,
          isClickable: true,
          metrics: {
            count: 1800,
          },
          rawRows: [
            rowsWithMultipleBreakouts[3],
            rowsWithMultipleBreakouts[4],
            rowsWithMultipleBreakouts[5],
          ],
          breakout: {
            "Doohickey - 110": {
              metrics: { count: 550 },
              rawRows: [rowsWithMultipleBreakouts[3]],
            },
            "Gadget - 120": {
              metrics: { count: 600 + 650 },
              rawRows: [
                rowsWithMultipleBreakouts[4],
                rowsWithMultipleBreakouts[5],
              ],
            },
          },
        },
      ]);
    });
  });
});
