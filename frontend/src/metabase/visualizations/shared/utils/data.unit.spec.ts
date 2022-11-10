import { DatasetData } from "metabase-types/api";
import { createMockColumn } from "metabase-types/api/mocks";
import {
  BreakoutChartColumns,
  MultipleMetricsChartColumns,
} from "metabase/visualizations/lib/graph/columns";
import { ColumnFormatter } from "metabase/visualizations/shared/types/format";
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

const dataset: DatasetData = {
  cols: [dimensionColumn, breakoutColumn, countMetricColumn, avgMetricColumn],
  rows: [
    [2020, "Doohickey", 400, 90],
    [2020, "Gadget", 450, 100],
    [2021, "Doohickey", 500, 110],
    [2021, "Gadget", 550, 120],
  ],
  rows_truncated: 0,
};

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
          dataset,
          multipleMetricsChartColumns,
          columnFormatter,
        );

        expect(groupedData).toStrictEqual([
          {
            dimensionValue: 2020,
            metrics: {
              count: 850,
              avg: 190,
            },
          },
          {
            dimensionValue: 2021,
            metrics: {
              count: 1050,
              avg: 230,
            },
          },
        ]);
      });
    });
  });

  describe("chart with a breakout", () => {
    it("should group dataset by dimension values and breakout", () => {
      const groupedData = getGroupedDataset(
        dataset,
        breakoutChartColumns,
        columnFormatter,
      );

      expect(groupedData).toStrictEqual([
        {
          dimensionValue: 2020,
          metrics: {
            count: 850,
            avg: 190,
          },
          breakout: {
            Doohickey: {
              count: 400,
              avg: 90,
            },
            Gadget: {
              count: 450,
              avg: 100,
            },
          },
        },
        {
          dimensionValue: 2021,
          metrics: {
            count: 1050,
            avg: 230,
          },
          breakout: {
            Doohickey: {
              count: 500,
              avg: 110,
            },
            Gadget: {
              count: 550,
              avg: 120,
            },
          },
        },
      ]);
    });
  });
});
