import {
  createMockCategoryColumn,
  createMockDataset,
  createMockNumericColumn,
} from "metabase-types/api/mocks";
import type { VisualizerVizDefinitionWithColumns } from "metabase-types/store/visualizer";

import { createDataSource } from "../utils";

import {
  addColumnToPieChart,
  combineWithPieChart,
  removeColumnFromPieChart,
} from "./pie";

describe("pie", () => {
  const metricColumn = createMockNumericColumn({ id: 1, name: "count" });
  const metricColumn2 = createMockNumericColumn({ id: 2, name: "sum" });

  const dimensionColumn = createMockCategoryColumn({
    id: 3,
    name: "category",
  });
  const dimensionColumn2 = createMockCategoryColumn({
    id: 4,
    name: "category2",
  });

  describe("addColumnToPieChart", () => {
    it("should add a metric column", () => {
      const state: VisualizerVizDefinitionWithColumns = {
        display: "pie",
        columns: [],
        settings: {},
        columnValuesMapping: {},
      };

      addColumnToPieChart(state, {}, { ...metricColumn, name: "COLUMN_1" });

      // TODO Enable when VIZ-652 is closed
      // expect(state.columns.map((c) => c.name)).toEqual(["COLUMN_1"]);
      // expect(state.columnValuesMapping).toEqual({
      //   COLUMN_1: [
      //     { sourceId: "card:1", name: "COLUMN_1", originalName: "count" },
      //   ],
      // });
      expect(state.settings).toEqual({ "pie.metric": "COLUMN_1" });
    });

    it("should not change the metric column if it's already set", () => {
      const settings = { "pie.metric": "COLUMN_1" };
      const state: VisualizerVizDefinitionWithColumns = {
        display: "pie",
        columns: [{ ...metricColumn, name: "COLUMN_1" }],
        settings,
        columnValuesMapping: {
          COLUMN_1: [
            {
              sourceId: "card:1",
              name: "COLUMN_1",
              originalName: "count",
            },
          ],
        },
      };

      addColumnToPieChart(state, settings, {
        ...metricColumn2,
        name: "COLUMN_2",
      });

      expect(state.columns.map((c) => c.name)).toEqual(["COLUMN_1"]);
      expect(Object.keys(state.columnValuesMapping)).toEqual(["COLUMN_1"]);
      expect(state.settings).toEqual({ "pie.metric": "COLUMN_1" });
    });

    it("should add a dimension column", () => {
      const state: VisualizerVizDefinitionWithColumns = {
        display: "pie",
        columns: [],
        settings: {},
        columnValuesMapping: {},
      };

      addColumnToPieChart(state, {}, { ...dimensionColumn, name: "COLUMN_1" });

      // TODO Enable when VIZ-652 is closed
      // expect(state.columns.map((c) => c.name)).toEqual(["COLUMN_1"]);
      // expect(state.columnValuesMapping).toEqual({
      //   COLUMN_1: [
      //     { sourceId: "card:1", name: "COLUMN_1", originalName: "count" },
      //   ],
      // });
      expect(state.settings).toEqual({ "pie.dimension": ["COLUMN_1"] });
    });

    it("should add a second dimension column", () => {
      const settings = { "pie.dimension": ["COLUMN_1"] };
      const state: VisualizerVizDefinitionWithColumns = {
        display: "pie",
        columns: [{ ...dimensionColumn, name: "COLUMN_1" }],
        settings,
        columnValuesMapping: {
          COLUMN_1: [
            {
              sourceId: "card:1",
              name: "COLUMN_1",
              originalName: "count",
            },
          ],
        },
      };

      addColumnToPieChart(state, settings, {
        ...dimensionColumn2,
        name: "COLUMN_2",
      });

      // TODO Enable when VIZ-652 is closed
      // expect(state.columns.map((c) => c.name)).toEqual([
      //   "COLUMN_1",
      //   "COLUMN_2",
      // ]);
      // expect(state.columnValuesMapping).toEqual({
      //   COLUMN_1: [
      //     {
      //       sourceId: "card:1",
      //       name: "COLUMN_1",
      //       originalName: "count",
      //     },
      //   ],
      //   COLUMN_2: [
      //     {
      //       sourceId: "card:1",
      //       name: "COLUMN_2",
      //       originalName: "category2",
      //     },
      //   ],
      // });
      expect(state.settings).toEqual({
        "pie.dimension": ["COLUMN_1", "COLUMN_2"],
      });
    });
  });

  describe("removeColumnFromPieChart", () => {
    it("should remove a metric column", () => {
      const settings = { "pie.metric": "COLUMN_1" };
      const state: VisualizerVizDefinitionWithColumns = {
        display: "pie",
        columns: [{ ...metricColumn, name: "COLUMN_1" }],
        settings,
        columnValuesMapping: {
          COLUMN_1: [
            {
              sourceId: "card:1",
              name: "COLUMN_1",
              originalName: "count",
            },
          ],
        },
      };

      removeColumnFromPieChart(state, settings, "COLUMN_1");

      expect(state.columns.map((c) => c.name)).toEqual([]);
      expect(state.columnValuesMapping).toEqual({});
      expect(state.settings).toEqual({});
    });

    it("should remove a dimension column", () => {
      const settings = { "pie.dimension": ["COLUMN_1"] };
      const state: VisualizerVizDefinitionWithColumns = {
        display: "pie",
        columns: [{ ...dimensionColumn, name: "COLUMN_1" }],
        settings,
        columnValuesMapping: {
          COLUMN_1: [
            {
              sourceId: "card:1",
              name: "COLUMN_1",
              originalName: "count",
            },
          ],
        },
      };

      removeColumnFromPieChart(state, settings, "COLUMN_1");

      expect(state.columns.map((c) => c.name)).toEqual([]);
      expect(state.columnValuesMapping).toEqual({});
      expect(state.settings).toEqual({ "pie.dimension": [] });
    });

    it("should do nothing if a column isn't used", () => {
      const settings = { "pie.dimension": ["COLUMN_1"] };
      const state: VisualizerVizDefinitionWithColumns = {
        display: "pie",
        columns: [{ ...dimensionColumn, name: "COLUMN_1" }],
        settings,
        columnValuesMapping: {
          COLUMN_1: [
            {
              sourceId: "card:1",
              name: "COLUMN_1",
              originalName: "count",
            },
          ],
        },
      };

      removeColumnFromPieChart(state, settings, "COLUMN_2");

      expect(state.columns.map((c) => c.name)).toEqual(["COLUMN_1"]);
      expect(Object.keys(state.columnValuesMapping)).toEqual(["COLUMN_1"]);
      expect(state.settings).toEqual({ "pie.dimension": ["COLUMN_1"] });
    });
  });

  describe("combineWithPieChart", () => {
    const dataSource = createDataSource("card", `entity_2`, "Q2");

    const metricColumn3 = createMockNumericColumn({ id: 5, name: "avg" });
    const dimensionColumn3 = createMockCategoryColumn({
      id: 6,
      name: "category3",
    });

    it("should set pie.metric if it's undefined and there's one metric column", () => {
      const settings = { "pie.dimension": ["COLUMN_1"] };
      const state: VisualizerVizDefinitionWithColumns = {
        display: "pie",
        columns: [{ ...dimensionColumn, name: "COLUMN_1" }],
        settings,
        columnValuesMapping: {
          COLUMN_1: [
            {
              sourceId: "card:entity_1",
              name: "COLUMN_1",
              originalName: "category",
            },
          ],
        },
      };

      combineWithPieChart(
        state,
        settings,
        createMockDataset({
          data: { cols: [metricColumn2] },
        }),
        dataSource,
      );

      expect(state.columns.map((c) => c.name)).toEqual([
        "COLUMN_1",
        "COLUMN_2",
      ]);
      expect(state.columnValuesMapping).toEqual({
        COLUMN_1: [
          {
            sourceId: "card:entity_1",
            name: "COLUMN_1",
            originalName: "category",
          },
        ],
        COLUMN_2: [
          { sourceId: "card:entity_2", name: "COLUMN_2", originalName: "sum" },
        ],
      });
      expect(state.settings).toEqual({
        "pie.metric": "COLUMN_2",
        "pie.dimension": ["COLUMN_1"],
      });
    });

    it("should not change pie.metric if it's already set", () => {
      const settings = { "pie.metric": "COLUMN_1" };
      const state: VisualizerVizDefinitionWithColumns = {
        display: "pie",
        columns: [{ ...metricColumn, name: "COLUMN_1" }],
        settings,
        columnValuesMapping: {
          COLUMN_1: [
            {
              sourceId: "card:entity_1",
              name: "COLUMN_1",
              originalName: "count",
            },
          ],
        },
      };

      combineWithPieChart(
        state,
        settings,
        createMockDataset({
          data: { cols: [metricColumn2] },
        }),
        dataSource,
      );

      expect(state.columns.map((c) => c.name)).toEqual(["COLUMN_1"]);
      expect(Object.keys(state.columnValuesMapping)).toEqual(["COLUMN_1"]);
      expect(state.settings).toEqual({ "pie.metric": "COLUMN_1" });
    });

    it("shouldn't set pie.metric if it's undefined and there are multiple metric columns", () => {
      const settings = { "pie.metric": "COLUMN_1" };
      const state: VisualizerVizDefinitionWithColumns = {
        display: "pie",
        columns: [{ ...metricColumn, name: "COLUMN_1" }],
        settings,
        columnValuesMapping: {
          COLUMN_1: [
            { sourceId: "card:1", name: "COLUMN_1", originalName: "count" },
          ],
        },
      };

      combineWithPieChart(
        state,
        settings,
        createMockDataset({
          data: { cols: [metricColumn2, metricColumn3] },
        }),
        dataSource,
      );

      expect(state.columns.map((c) => c.name)).toEqual(["COLUMN_1"]);
      expect(Object.keys(state.columnValuesMapping)).toEqual(["COLUMN_1"]);
      expect(state.settings).toEqual({ "pie.metric": "COLUMN_1" });
    });

    it("should set pie.dimension if it's undefined and there's one dimension column", () => {
      const settings = { "pie.metric": "COLUMN_1" };
      const state: VisualizerVizDefinitionWithColumns = {
        display: "pie",
        columns: [{ ...metricColumn, name: "COLUMN_1" }],
        settings,
        columnValuesMapping: {
          COLUMN_1: [
            { sourceId: "card:1", name: "COLUMN_1", originalName: "count" },
          ],
        },
      };

      combineWithPieChart(
        state,
        settings,
        createMockDataset({
          data: { cols: [dimensionColumn] },
        }),
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
        "pie.metric": "COLUMN_1",
        "pie.dimension": ["COLUMN_2"],
      });
    });

    it("should not set pie.dimension if it's undefined and there are multiple dimension columns", () => {
      const settings = { "pie.metric": "COLUMN_1" };
      const state: VisualizerVizDefinitionWithColumns = {
        display: "pie",
        columns: [{ ...metricColumn, name: "COLUMN_1" }],
        settings,
        columnValuesMapping: {
          COLUMN_1: [
            { sourceId: "card:1", name: "COLUMN_1", originalName: "count" },
          ],
        },
      };

      combineWithPieChart(
        state,
        settings,
        createMockDataset({
          data: { cols: [dimensionColumn2, dimensionColumn3] },
        }),
        dataSource,
      );

      expect(state.columns.map((c) => c.name)).toEqual(["COLUMN_1"]);
      expect(Object.keys(state.columnValuesMapping)).toEqual(["COLUMN_1"]);
      expect(state.settings).toEqual({ "pie.metric": "COLUMN_1" });
    });

    it("should not change pie.dimension if it's already set", () => {
      const settings = { "pie.dimension": ["COLUMN_1"] };
      const state: VisualizerVizDefinitionWithColumns = {
        display: "pie",
        columns: [{ ...dimensionColumn, name: "COLUMN_1" }],
        settings,
        columnValuesMapping: {
          COLUMN_1: [
            { sourceId: "card:1", name: "COLUMN_1", originalName: "count" },
          ],
        },
      };

      combineWithPieChart(
        state,
        settings,
        createMockDataset({
          data: { cols: [dimensionColumn2] },
        }),
        dataSource,
      );

      expect(state.columns.map((c) => c.name)).toEqual(["COLUMN_1"]);
      expect(Object.keys(state.columnValuesMapping)).toEqual(["COLUMN_1"]);
      expect(state.settings).toEqual({ "pie.dimension": ["COLUMN_1"] });
    });
  });
});
