import { createMockColumn, createMockDataset } from "metabase-types/api/mocks";
import type { VisualizerHistoryItem } from "metabase-types/store/visualizer";

import { createDataSource, createVisualizerColumnReference } from "../utils";

import {
  addColumnToCartesianChart,
  addDimensionColumnToCartesianChart,
  addMetricColumnToCartesianChart,
  removeBubbleSizeFromCartesianChart,
  removeColumnFromCartesianChart,
  replaceMetricColumnAsScatterBubbleSize,
} from "./cartesian";

describe("cartesian", () => {
  describe("addColumnToCartesianChart", () => {
    const dataSource = createDataSource("card", 1, "Card 1");

    const column1 = createMockColumn({
      name: "CREATED_AT",
      effective_type: "type/DateTime",
    });
    const column1Ref = createVisualizerColumnReference(dataSource, column1, []);

    const column2 = createMockColumn({
      effective_type: "type/BigInteger",
      name: "count",
    });
    const column2Ref = createVisualizerColumnReference(dataSource, column2, [
      column1Ref,
    ]);

    const column3 = createMockColumn({
      effective_type: "type/BigInteger",
      name: "avg",
    });
    const column3Ref = createVisualizerColumnReference(dataSource, column3, [
      column1Ref,
      column2Ref,
    ]);

    const dataset = createMockDataset({});

    describe("for scatter", () => {
      it("should add columns in the right order", () => {
        const state: VisualizerHistoryItem = {
          columns: [],
          settings: {},
          columnValuesMapping: {},
          display: "scatter",
        };

        // First column is automatically added as a dimension
        addColumnToCartesianChart(
          state,
          column1,
          column1Ref,
          dataset,
          dataSource,
        );
        expect(state.columns.map((c) => c.name)).toEqual(["COLUMN_1"]);
        expect(Object.keys(state.columnValuesMapping)).toEqual(["COLUMN_1"]);
        expect(state.settings).toEqual({ "graph.dimensions": ["COLUMN_1"] });

        // Second column is automatically added as a metric
        addColumnToCartesianChart(
          state,
          column2,
          column2Ref,
          dataset,
          dataSource,
        );
        expect(state.columns.map((c) => c.name)).toEqual([
          "COLUMN_1",
          "COLUMN_2",
        ]);
        expect(Object.keys(state.columnValuesMapping)).toEqual([
          "COLUMN_1",
          "COLUMN_2",
        ]);
        expect(state.settings).toEqual({
          "graph.dimensions": ["COLUMN_1"],
          "graph.metrics": ["COLUMN_2"], // <-- this is the only change
        });

        // Third column is automatically added as a the bubble size
        addColumnToCartesianChart(
          state,
          column3,
          column3Ref,
          dataset,
          dataSource,
        );
        expect(state.columns.map((c) => c.name)).toEqual([
          "COLUMN_1",
          "COLUMN_2",
          "COLUMN_3",
        ]);
        expect(Object.keys(state.columnValuesMapping)).toEqual([
          "COLUMN_1",
          "COLUMN_2",
          "COLUMN_3",
        ]);
        expect(state.settings).toEqual({
          "graph.dimensions": ["COLUMN_1"],
          "graph.metrics": ["COLUMN_2"],
          "scatter.bubble": "COLUMN_3", // <-- this is the only change
        });
      });
    });
  });

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

      expect(state.columns.map((c) => c.name)).toEqual(["COLUMN_1"]);
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
      expect(state.columns.map((c) => c.name)).toEqual(["COLUMN_2"]);
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

    it("should not replace a column that's used as a metric", () => {
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
      expect(state.columns.map((c) => c.name)).toEqual([
        "COLUMN_1",
        "COLUMN_2",
      ]);
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

    it("should not delete a column that is used as a metric", () => {
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

      // Remove the first column as a bubble
      removeBubbleSizeFromCartesianChart(state, "COLUMN_1");

      // Check that we have both columns where they should be
      expect(state.columns.map((c) => c.name)).toEqual(["COLUMN_1"]);
      expect(state.columnValuesMapping).toEqual({
        COLUMN_1: [
          {
            name: "COLUMN_1",
            originalName: "count",
            sourceId: "card:1",
          },
        ],
      });
      expect(state.settings).toEqual({
        "graph.metrics": ["COLUMN_1"],
      });
    });

    it("should not delete a column that is used as the bubble", () => {
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

      // Remove the first column as a metric
      removeColumnFromCartesianChart(state, "COLUMN_1");

      // Check that we have both columns where they should be
      expect(state.columns.map((c) => c.name)).toEqual(["COLUMN_1"]);
      expect(state.columnValuesMapping).toEqual({
        COLUMN_1: [
          {
            name: "COLUMN_1",
            originalName: "count",
            sourceId: "card:1",
          },
        ],
      });
      expect(state.settings).toEqual({
        "scatter.bubble": "COLUMN_1",
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
      expect(state.columns.map((c) => c.name)).toEqual([
        "COLUMN_1",
        "COLUMN_2",
      ]);
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
