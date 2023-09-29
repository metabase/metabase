import {
  createMockCard,
  createMockColumn,
  createMockDatasetData,
} from "metabase-types/api/mocks";
import type {
  BreakoutChartColumns,
  CartesianChartColumns,
} from "metabase/visualizations/lib/graph/columns";
import type { RowValue, SingleSeries } from "metabase-types/api";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import {
  sumMetric,
  getDatasetKey,
  getJoinedCardsDataset,
  replaceValues,
  getNullReplacerFunction,
} from "./dataset";
import type { DataKey, SeriesModel } from "./types";

describe("dataset transform functions", () => {
  describe("sumMetric", () => {
    it("should return the sum when both arguments are numbers", () => {
      expect(sumMetric(3, 7)).toBe(10);
    });

    it("should return the left number when right is not a number", () => {
      expect(sumMetric(5, null)).toBe(5);
    });

    it("should return the right number when left is not a number", () => {
      expect(sumMetric(null, 5)).toBe(5);
    });

    it("should return null when neither left nor right is a number", () => {
      expect(sumMetric(null, null)).toBeNull();
    });
  });

  describe("getDatasetKey", () => {
    const column = createMockColumn({ name: "count" });

    it("should return the column name if cardId and breakoutValue are undefined", () => {
      expect(getDatasetKey(column)).toBe("count");
    });

    it("should return the cardId concatenated with column name if cardId is provided and breakoutValue is undefined", () => {
      expect(getDatasetKey(column, 1)).toBe("1:count");
    });

    it("should return the breakoutValue concatenated with column name if breakoutValue is provided and cardId is undefined", () => {
      expect(getDatasetKey(column, undefined, "breakoutValue")).toBe(
        "breakoutValue:count",
      );
    });

    it("should return the cardId, breakoutValue and column name concatenated if all are provided", () => {
      expect(getDatasetKey(column, 1, "breakoutValue")).toBe(
        "1:breakoutValue:count",
      );
    });

    it("should handle different types of breakout values correctly", () => {
      expect(getDatasetKey(column, 1, "stringValue")).toBe(
        "1:stringValue:count",
      );
      expect(getDatasetKey(column, 1, 123)).toBe("1:123:count");
      expect(getDatasetKey(column, 1, true)).toBe("1:true:count");
      expect(getDatasetKey(column, 1, null)).toBe("1:null:count");
    });
  });

  describe("getJoinedCardsDataset", () => {
    const columns1: CartesianChartColumns = {
      dimension: { index: 0, column: createMockColumn({ name: "month" }) },
      metrics: [
        {
          index: 2,
          column: createMockColumn({
            name: "count",
            base_type: "type/Integer",
          }),
        },
      ],
    };

    const columns2: BreakoutChartColumns = {
      dimension: { index: 0, column: createMockColumn({ name: "also_month" }) },
      metric: {
        index: 2,
        column: createMockColumn({
          name: "count",
          base_type: "type/Integer",
        }),
      },
      breakout: { index: 1, column: createMockColumn({ name: "type" }) },
    };

    const rawSeries1: SingleSeries = {
      card: createMockCard({ id: 1 }),
      data: createMockDatasetData({
        rows: [
          [1, "category1", 200],
          [2, "category1", 300],
          [3, "category2", 400],
          [3, "category3", 500],
        ],
        cols: [
          columns1.dimension.column,
          createMockColumn({ name: "category" }),
          columns1.metrics[0].column,
        ],
      }),
    };

    const rawSeries2: SingleSeries = {
      card: createMockCard({ id: 2 }),
      data: createMockDatasetData({
        rows: [
          [1, "type1", 100],
          [2, "type1", 200],
          [3, "type2", 300],
          [3, "type3", 400],
        ],
        cols: [
          columns2.dimension.column,
          columns2.breakout.column,
          columns2.metric.column,
        ],
      }),
    };

    it("should sum metrics by the specified dimension", () => {
      const result = getJoinedCardsDataset([rawSeries1], [columns1]);
      expect(result).toStrictEqual([
        { "1:month": 1, "1:count": 200 },
        { "1:month": 2, "1:count": 300 },
        { "1:month": 3, "1:count": 900 },
      ]);
    });

    it("should handle breakout column if provided", () => {
      const result = getJoinedCardsDataset([rawSeries2], [columns2]);
      expect(result).toStrictEqual([
        { "2:also_month": 1, "2:count": 100, "2:type1:count": 100 },
        { "2:also_month": 2, "2:count": 200, "2:type1:count": 200 },
        {
          "2:also_month": 3,
          "2:count": 700,
          "2:type2:count": 300,
          "2:type3:count": 400,
        },
      ]);
    });

    it("should join multiple rawSeries (combined cards) by their dimension columns", () => {
      const result = getJoinedCardsDataset(
        [rawSeries1, rawSeries2],
        [columns1, columns2],
      );
      expect(result).toStrictEqual([
        {
          "1:month": 1,
          "1:count": 200,
          "2:count": 100,
          "2:type1:count": 100,
        },
        {
          "1:month": 2,
          "1:count": 300,
          "2:count": 200,
          "2:type1:count": 200,
        },
        {
          "1:month": 3,
          "1:count": 900,
          "2:count": 700,
          "2:type2:count": 300,
          "2:type3:count": 400,
        },
      ]);
    });

    it("should handle empty arrays", () => {
      const result = getJoinedCardsDataset([], []);
      expect(result).toEqual([]);
    });
  });

  describe("replaceValues", () => {
    it("should replace missing values with zeros according to the replacer function", () => {
      const dataset: Record<DataKey, RowValue>[] = [
        { key1: null, key2: 2 },
        { key1: 3, key2: null },
      ];
      const replacer = (dataKey: string, value: RowValue) => {
        if (dataKey === "key1") {
          return value;
        }
        return value ?? 0;
      };

      const result = replaceValues(dataset, replacer);

      expect(result).toEqual([
        { key1: null, key2: 2 },
        { key1: 3, key2: 0 },
      ]);
    });
  });

  describe("getNullReplacerFunction", () => {
    it("should create a replacer function that replaces null values with zeros for specified series only", () => {
      const createMockSeriesModel = (
        dataKey: DataKey,
        index: number,
      ): SeriesModel => ({
        dataKey: "key1",
        legacySeriesSettingsObjectKey: "key1",
        vizSettingsKey: "key1",
        column: createMockColumn({ name: dataKey }),
        columnIndex: index,
      });

      const settings: ComputedVisualizationSettings = {
        series: (key: string) => ({
          "line.missing": key === "key1" ? "zero" : undefined,
        }),
      };

      const seriesModels = [
        createMockSeriesModel("key1", 0),
        createMockSeriesModel("key2", 1),
      ];

      const replacer = getNullReplacerFunction(settings, seriesModels);

      expect(replacer("key1", null)).toBe(0);
      expect(replacer("key1", 1)).toBe(1);
      expect(replacer("key2", null)).toBe(null);
      expect(replacer("key2", 2)).toBe(2);
    });
  });
});
