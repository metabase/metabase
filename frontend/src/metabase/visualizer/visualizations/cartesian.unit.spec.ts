import { createMockColumn } from "metabase-types/api/mocks";
import type { VisualizerHistoryItem } from "metabase-types/store/visualizer";

import { createDataSource, createVisualizerColumnReference } from "../utils";

import {
  addDimensionColumnToCartesianChart,
  addMetricColumnToCartesianChart,
  replaceMetricColumnAsScatterBubbleSize,
} from "./cartesian";

describe("cartesian", () => {
  describe("scatter bubble size", () => {
    const dataSource = createDataSource("card", 1, "Card 1");

    const column1 = createMockColumn({ name: "count" });
    const column1Ref = createVisualizerColumnReference(dataSource, column1, []);

    const column2 = createMockColumn({ name: "sum" });
    const column2Ref = createVisualizerColumnReference(dataSource, column2, [
      column1Ref,
    ]);

    it("should add a column", () => {
      const state: VisualizerHistoryItem = {
        columns: [],
        settings: {},
        columnValuesMapping: {},
        display: "scatter",
      };

      replaceMetricColumnAsScatterBubbleSize(
        state,
        column1,
        column1Ref,
        dataSource,
      );

      expect(state.columns.map(c => c.name)).toEqual(["COLUMN_1"]);
      expect(state.columnValuesMapping).toEqual({
        COLUMN_1: [
          {
            name: "COLUMN_1",
            originalName: "count",
            sourceId: "card:1",
          },
        ],
      });
      expect(state.settings).toEqual({ "scatter.bubble": "COLUMN_1" });
    });

    it("should replace a column", () => {
      const state: VisualizerHistoryItem = {
        columns: [],
        settings: {},
        columnValuesMapping: {},
        display: "scatter",
      };
      // Add the first column
      replaceMetricColumnAsScatterBubbleSize(
        state,
        column1,
        column1Ref,
        dataSource,
      );

      // Replace the first column with the second column
      replaceMetricColumnAsScatterBubbleSize(
        state,
        column2,
        column2Ref,
        dataSource,
      );

      // Check that we only have the second column
      expect(state.columns.map(c => c.name)).toEqual(["COLUMN_2"]);
      expect(state.columnValuesMapping).toEqual({
        COLUMN_2: [
          {
            name: "COLUMN_2",
            originalName: "sum",
            sourceId: "card:1",
          },
        ],
      });
      expect(state.settings).toEqual({ "scatter.bubble": "COLUMN_2" });
    });

    it("should not delete a column that's used as a metric", () => {
      const state: VisualizerHistoryItem = {
        columns: [],
        settings: {},
        columnValuesMapping: {},
        display: "scatter",
      };
      // Add the first column as the Y axis
      addMetricColumnToCartesianChart(state, column1, column1Ref, dataSource);

      // Add it as the bubble size too
      replaceMetricColumnAsScatterBubbleSize(
        state,
        column1,
        column1Ref,
        dataSource,
      );

      // Add the second column
      replaceMetricColumnAsScatterBubbleSize(
        state,
        column2,
        column2Ref,
        dataSource,
      );

      // Check that we have both columns where they should be
      expect(state.columns.map(c => c.name)).toEqual(["COLUMN_1", "COLUMN_2"]);
      expect(state.columnValuesMapping).toEqual({
        COLUMN_1: [
          {
            name: "COLUMN_1",
            originalName: "count",
            sourceId: "card:1",
          },
        ],
        COLUMN_2: [
          {
            name: "COLUMN_2",
            originalName: "sum",
            sourceId: "card:1",
          },
        ],
      });
      expect(state.settings).toEqual({
        "scatter.bubble": "COLUMN_2",
        "graph.metrics": ["COLUMN_1"],
      });
    });

    it("should not delete a column that's used as a dimension", () => {
      const state: VisualizerHistoryItem = {
        columns: [],
        settings: {},
        columnValuesMapping: {},
        display: "scatter",
      };
      // Add the first column as the X axis
      addDimensionColumnToCartesianChart(
        state,
        column1,
        column1Ref,
        dataSource,
      );

      // Add it as the bubble size too
      replaceMetricColumnAsScatterBubbleSize(
        state,
        column1,
        column1Ref,
        dataSource,
      );

      // Add the second column
      replaceMetricColumnAsScatterBubbleSize(
        state,
        column2,
        column2Ref,
        dataSource,
      );

      // Check that we have both columns where they should be
      expect(state.columns.map(c => c.name)).toEqual(["COLUMN_1", "COLUMN_2"]);
      expect(state.columnValuesMapping).toEqual({
        COLUMN_1: [
          {
            name: "COLUMN_1",
            originalName: "count",
            sourceId: "card:1",
          },
        ],
        COLUMN_2: [
          {
            name: "COLUMN_2",
            originalName: "sum",
            sourceId: "card:1",
          },
        ],
      });
      expect(state.settings).toEqual({
        "scatter.bubble": "COLUMN_2",
        "graph.dimensions": ["COLUMN_1"],
      });
    });
  });
});
