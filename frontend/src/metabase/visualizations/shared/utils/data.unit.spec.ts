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

const breakoutChartColumns: BreakoutChartColumns = {
  dimension: {
    column: dimensionColumn,
    index: 0,
  },
  breakout: {
    column: breakoutColumn,
    index: 1,
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
});
