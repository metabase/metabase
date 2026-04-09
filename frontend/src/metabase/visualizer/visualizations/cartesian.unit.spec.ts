import _ from "underscore";

import {
  createMockCategoryColumn,
  createMockColumn,
  createMockDataset,
  createMockDatetimeColumn,
  createMockNumericColumn,
  createMockVisualizationSettings,
} from "metabase-types/api/mocks";
import type { VisualizerVizDefinitionWithColumns } from "metabase-types/store/visualizer";

import {
  copyColumn,
  createDataSource,
  createVisualizerColumnReference,
} from "../utils";

import {
  addColumnToCartesianChart,
  addDimensionColumnToCartesianChart,
  addMetricColumnToCartesianChart,
  combineWithCartesianChart,
  findColumnSlotForCartesianChart,
  removeBubbleSizeFromCartesianChart,
  removeColumnFromCartesianChart,
  replaceMetricColumnAsScatterBubbleSize,
} from "./cartesian";

describe("cartesian", () => {
  describe("findColumnSlotForCartesianChart", () => {
    const metricColumn = createMockNumericColumn({
      id: 1,
      name: "COLUMN_1",
      display_name: "Count",
    });
    const timeDimensionColumn = createMockDatetimeColumn({
      id: 2,
      name: "COLUMN_2",
      display_name: "Created At",
    });
    const categoryDimensionColumn = createMockCategoryColumn({
      id: 3,
      name: "COLUMN_3",
      display_name: "Category",
    });

    const dateColumn = createMockDatetimeColumn({ id: 4 });
    const sameCategoryDimensionColumn = createMockCategoryColumn({
      id: categoryDimensionColumn.id,
    });
    const otherCategoryDimensionColumn = createMockCategoryColumn({ id: 5 });

    const otherMetricColumn = createMockNumericColumn({
      id: 6,
      name: "COLUMN_6",
      display_name: "Other Metric",
    });

    it("should return 'graph.metrics' for a metric column", () => {
      const state = { display: "bar" as const, columns: [], settings: {} };
      expect(
        findColumnSlotForCartesianChart({
          state,
          settings: {},
          column: metricColumn,
        }),
      ).toEqual("graph.metrics");
    });

    describe("dimensions", () => {
      it("should return 'graph.dimensions' for any dimension column when chart has no dimensions", () => {
        const settings = { "graph.metrics": [metricColumn.name] };
        const state = {
          display: "bar" as const,
          columns: [metricColumn],
          settings,
        };

        expect(
          findColumnSlotForCartesianChart({
            state,
            settings,
            column: timeDimensionColumn,
          }),
        ).toEqual("graph.dimensions");
        expect(
          findColumnSlotForCartesianChart({
            state,
            settings,
            column: categoryDimensionColumn,
          }),
        ).toEqual("graph.dimensions");
      });

      it("should return 'graph.dimensions' for a date column when chart has a time dimension", () => {
        const settings = {
          "graph.metrics": [metricColumn.name],
          "graph.dimensions": [timeDimensionColumn.name],
        };
        const state = {
          display: "bar" as const,
          columns: [metricColumn],
          settings,
        };

        expect(
          findColumnSlotForCartesianChart({
            state,
            settings,
            column: dateColumn,
          }),
        ).toBe("graph.dimensions");
      });

      it("should return graph.dimensions for a non-date column even if a chart only has a time dimension", () => {
        const settings = {
          "graph.metrics": [metricColumn.name],
          "graph.dimensions": [timeDimensionColumn.name],
        };
        const state = {
          display: "bar" as const,
          columns: [metricColumn],
          settings,
        };

        expect(
          findColumnSlotForCartesianChart({
            state,
            settings,
            column: categoryDimensionColumn,
          }),
        ).toBe("graph.dimensions");
      });

      it("should return 'graph.dimensions' for a date column when chart has a time dimension and a category dimension", () => {
        const settings = {
          "graph.metrics": [metricColumn.name],
          "graph.dimensions": [
            timeDimensionColumn.name,
            categoryDimensionColumn.name,
          ],
        };
        const state = {
          display: "bar" as const,
          columns: [metricColumn],
          settings,
        };

        expect(
          findColumnSlotForCartesianChart({
            state,
            settings,
            column: dateColumn,
          }),
        ).toBe("graph.dimensions");
      });

      it("should return 'graph.dimensions' for a category dimension when chart has the same dimension", () => {
        const settings = {
          "graph.metrics": [metricColumn.name],
          "graph.dimensions": [categoryDimensionColumn.name],
        };
        const state = {
          display: "bar" as const,
          columns: [metricColumn],
          settings,
        };

        expect(
          findColumnSlotForCartesianChart({
            state,
            settings,
            column: sameCategoryDimensionColumn,
          }),
        ).toBe("graph.dimensions");
      });

      it("should return graph.dimensions for a category dimension even if a chart doesn't have the same dimension", () => {
        const settings = {
          "graph.metrics": [metricColumn.name],
          "graph.dimensions": [categoryDimensionColumn.name],
        };
        const state = {
          display: "bar" as const,
          columns: [metricColumn],
          settings,
        };

        expect(
          findColumnSlotForCartesianChart({
            state,
            settings,
            column: otherCategoryDimensionColumn,
          }),
        ).toBe("graph.dimensions");
      });

      it("should return 'graph.dimensions' for a category dimension when chart has a time dimension and the same category dimension", () => {
        const settings = {
          "graph.metrics": [metricColumn.name],
          "graph.dimensions": [
            timeDimensionColumn.name,
            categoryDimensionColumn.name,
          ],
        };
        const state = {
          display: "bar" as const,
          columns: [metricColumn],
          settings,
        };

        expect(
          findColumnSlotForCartesianChart({
            state,
            settings,
            column: sameCategoryDimensionColumn,
          }),
        ).toBe("graph.dimensions");
      });

      it("should return 'graph.dimensions' for a category dimension when chart has a time dimension, but not the same category dimension", () => {
        const settings = {
          "graph.metrics": [metricColumn.name],
          "graph.dimensions": [
            timeDimensionColumn.name,
            categoryDimensionColumn.name,
          ],
        };
        const state = {
          display: "bar" as const,
          columns: [metricColumn],
          settings,
        };

        expect(
          findColumnSlotForCartesianChart({
            state,
            settings,
            column: otherCategoryDimensionColumn,
          }),
        ).toBe("graph.dimensions");
      });

      it("should return 'graph.dimensions' for a new time dimension when every data source has a time dimension", () => {
        const settings = {
          "graph.metrics": [metricColumn.name],
          "graph.dimensions": [categoryDimensionColumn.name],
        };
        const state = {
          display: "bar" as const,
          columns: [metricColumn],
          settings,
        };

        expect(
          findColumnSlotForCartesianChart({
            state,
            settings,
            column: dateColumn,
          }),
        ).toBe("graph.dimensions");
      });

      it("should return graph.dimensions for a new time dimension even if not every data source has a time dimension", () => {
        const settings = {
          "graph.metrics": [metricColumn.name],
          "graph.dimensions": [categoryDimensionColumn.name],
        };
        const state = {
          display: "bar" as const,
          columns: [metricColumn],
          settings,
        };

        expect(
          findColumnSlotForCartesianChart({
            state,
            settings,
            column: dateColumn,
          }),
        ).toBe("graph.dimensions");
      });

      it("should return 'graph.dimensions' for a new category dimension when it's present in every data source", () => {
        const settings = {
          "graph.metrics": [metricColumn.name],
          "graph.dimensions": [timeDimensionColumn.name],
        };
        const state = {
          display: "bar" as const,
          columns: [metricColumn],
          settings,
        };

        expect(
          findColumnSlotForCartesianChart({
            state,
            settings,
            column: sameCategoryDimensionColumn,
          }),
        ).toBe("graph.dimensions");
      });

      it("should return graph.dimensions for a new category dimension even if it's not present in every data source", () => {
        const settings = {
          "graph.metrics": [metricColumn.name],
          "graph.dimensions": [timeDimensionColumn.name],
        };
        const state = {
          display: "bar" as const,
          columns: [metricColumn],
          settings,
        };

        expect(
          findColumnSlotForCartesianChart({
            state,
            settings,
            column: sameCategoryDimensionColumn,
          }),
        ).toBe("graph.dimensions");
      });

      it("should return graph.dimensions for a new category dimension when there are several metrics selected", () => {
        const settings = {
          "graph.metrics": [metricColumn.name, otherMetricColumn.name],
          "graph.dimensions": [timeDimensionColumn.name],
        };
        const state = {
          display: "bar" as const,
          columns: [metricColumn, otherMetricColumn, timeDimensionColumn],
          settings,
        };

        expect(
          findColumnSlotForCartesianChart({
            state,
            settings,
            column: sameCategoryDimensionColumn,
          }),
        ).toBe("graph.dimensions");
      });

      it("should return 'graph.dimensions' for a compatible date dimension when there are several metrics selected", () => {
        const settings = {
          "graph.metrics": [metricColumn.name, otherMetricColumn.name],
          "graph.dimensions": [timeDimensionColumn.name],
        };
        const state = {
          display: "bar" as const,
          columns: [metricColumn, otherMetricColumn],
          settings,
        };

        expect(
          findColumnSlotForCartesianChart({
            state,
            settings,
            column: timeDimensionColumn,
          }),
        ).toBe("graph.dimensions");
      });
    });
  });

  describe("addColumnToCartesianChart", () => {
    const dataSource = createDataSource("card", 1, "Card 1");

    const column1 = createMockDatetimeColumn({ id: 1, name: "CREATED_AT" });
    const column1Ref = createVisualizerColumnReference(dataSource, column1, []);

    const column2 = createMockNumericColumn({ id: 2, name: "count" });
    const column2Ref = createVisualizerColumnReference(dataSource, column2, [
      column1Ref,
    ]);

    const column3 = createMockNumericColumn({ id: 3, name: "avg" });
    const column3Ref = createVisualizerColumnReference(dataSource, column3, [
      column1Ref,
      column2Ref,
    ]);

    const column4 = createMockColumn({
      id: 4,
      name: "BOOL",
      base_type: "type/Boolean",
      effective_type: "type/Boolean",
      semantic_type: null,
    });
    const column4Ref = createVisualizerColumnReference(dataSource, column4, [
      column1Ref,
      column2Ref,
    ]);

    it("should add a metric column", () => {
      const state: VisualizerVizDefinitionWithColumns = {
        display: "bar",
        columns: [],
        settings: {},
        columnValuesMapping: {},
      };

      addColumnToCartesianChart(
        state,
        {},
        {},
        [column2],
        column2,
        column2Ref,
        dataSource,
      );

      expect(state.columns.map((c) => c.name)).toEqual(["COLUMN_2"]);
      expect(state.columnValuesMapping).toEqual({
        COLUMN_2: [
          {
            name: "COLUMN_2",
            originalName: column2.name,
            sourceId: dataSource.id,
          },
        ],
      });
      expect(state.settings).toEqual({ "graph.metrics": ["COLUMN_2"] });
    });

    it("should add a dimension column", () => {
      const state: VisualizerVizDefinitionWithColumns = {
        display: "bar",
        columns: [],
        settings: {},
        columnValuesMapping: {},
      };

      addColumnToCartesianChart(
        state,
        {},
        {},
        [column1],
        column1,
        column1Ref,
        dataSource,
      );

      expect(state.columns.map((c) => c.name)).toEqual(["COLUMN_1"]);
      expect(state.columnValuesMapping).toEqual({
        COLUMN_1: [
          {
            name: "COLUMN_1",
            originalName: column1.name,
            sourceId: dataSource.id,
          },
        ],
      });
      expect(state.settings).toEqual({ "graph.dimensions": ["COLUMN_1"] });
    });

    it("should do nothing if the column is already in the state", () => {
      const settings = { "graph.dimensions": ["COLUMN_1"] };
      const state: VisualizerVizDefinitionWithColumns = {
        display: "bar",
        columns: [{ ...column1, name: "COLUMN_1" }],
        settings,
        columnValuesMapping: {
          COLUMN_1: [
            {
              name: "COLUMN_1",
              originalName: column1.name,
              sourceId: dataSource.id,
            },
          ],
        },
      };

      addColumnToCartesianChart(
        state,
        settings,
        {},
        [column1],
        column1,
        column1Ref,
        dataSource,
      );

      expect(state.columns.map((c) => c.name)).toEqual(["COLUMN_1"]);
      expect(state.columnValuesMapping).toEqual({
        COLUMN_1: [
          {
            name: "COLUMN_1",
            originalName: column1.name,
            sourceId: dataSource.id,
          },
        ],
      });
      expect(state.settings).toEqual({ "graph.dimensions": ["COLUMN_1"] });
    });

    // TODO Enable when VIZ-652 is closed
    // eslint-disable-next-line jest/no-disabled-tests
    it.skip("should do nothing if the column can't be used in a chart", () => {
      const state: VisualizerVizDefinitionWithColumns = {
        columns: [],
        settings: {},
        columnValuesMapping: {},
        display: "bar",
      };

      addColumnToCartesianChart(
        state,
        {},
        {},
        [column4],
        column4,
        column4Ref,
        dataSource,
      );

      expect(state.columns.map((c) => c.name)).toEqual([]);
      expect(state.columnValuesMapping).toEqual({});
      expect(state.settings).toEqual({});
    });

    describe("for scatter", () => {
      it("should add columns in the right order", () => {
        const state: VisualizerVizDefinitionWithColumns = {
          columns: [],
          settings: {},
          columnValuesMapping: {},
          display: "scatter",
        };

        // First column is automatically added as a dimension
        addColumnToCartesianChart(
          state,
          {},
          {},
          [column1],
          copyColumn(column1Ref.name, column1, dataSource.name, []),
          column1Ref,
          dataSource,
        );
        expect(state.columns.map((c) => c.name)).toEqual(["COLUMN_1"]);
        expect(Object.keys(state.columnValuesMapping)).toEqual(["COLUMN_1"]);
        expect(state.settings).toEqual({ "graph.dimensions": ["COLUMN_1"] });

        // Second column is automatically added as a metric
        addColumnToCartesianChart(
          state,
          { "graph.dimensions": ["COLUMN_1"] },
          {},
          [column2],
          copyColumn(column2Ref.name, column2, dataSource.name, []),
          column2Ref,
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
          {
            "graph.dimensions": ["COLUMN_1"],
            "graph.metrics": ["COLUMN_2"],
          },
          {},
          [column3],
          copyColumn(column3Ref.name, column3, dataSource.name, []),
          column3Ref,
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

  describe("removeColumnFromCartesianChart", () => {
    const dataSource1 = createDataSource("card", 1, "Card 1");
    const metric1 = createMockNumericColumn({ id: 1, name: "count" });
    const dimension1 = createMockDatetimeColumn({ id: 2, name: "created_at" });

    const dataSource2 = createDataSource("card", 2, "Card 2");
    const metric2 = createMockNumericColumn({ id: 3, name: "avg" });
    const dimension2 = createMockDatetimeColumn({ id: 4, name: "date" });

    it("should remove a metric from a single series chart", () => {
      const settings = {
        "graph.metrics": ["COLUMN_1"],
        "graph.dimensions": ["COLUMN_2"],
      };
      const state: VisualizerVizDefinitionWithColumns = {
        display: "bar",
        columns: [
          { ...metric1, name: "COLUMN_1" },
          { ...dimension1, name: "COLUMN_2" },
        ],
        columnValuesMapping: {
          COLUMN_1: [
            {
              sourceId: dataSource1.id,
              name: "COLUMN_1",
              originalName: "count",
            },
          ],
          COLUMN_2: [
            {
              sourceId: dataSource1.id,
              name: "COLUMN_2",
              originalName: "created_at",
            },
          ],
        },
        settings,
      };

      removeColumnFromCartesianChart(state, settings, "COLUMN_1");

      expect(state.columns.map((c) => c.name)).toEqual(["COLUMN_2"]);
      expect(state.columnValuesMapping).toEqual({
        COLUMN_2: [
          { sourceId: "card:1", name: "COLUMN_2", originalName: "created_at" },
        ],
      });
      expect(state.settings).toEqual({
        "graph.metrics": [],
        "graph.dimensions": ["COLUMN_2"],
      });
    });

    it("should remove a metric from a multi series chart", () => {
      const settings = {
        "graph.metrics": ["COLUMN_1", "COLUMN_3"],
        "graph.dimensions": ["COLUMN_2", "COLUMN_4"],
      };
      const state: VisualizerVizDefinitionWithColumns = {
        display: "bar",
        columns: [
          { ...metric1, name: "COLUMN_1" },
          { ...dimension1, name: "COLUMN_2" },
          { ...metric2, name: "COLUMN_3" },
          { ...dimension2, name: "COLUMN_4" },
        ],
        columnValuesMapping: {
          COLUMN_1: [
            {
              sourceId: dataSource1.id,
              name: "COLUMN_1",
              originalName: "count",
            },
          ],
          COLUMN_2: [
            {
              sourceId: dataSource1.id,
              name: "COLUMN_2",
              originalName: "created_at",
            },
          ],
          COLUMN_3: [
            {
              sourceId: dataSource2.id,
              name: "COLUMN_3",
              originalName: "avg",
            },
          ],
          COLUMN_4: [
            {
              sourceId: dataSource2.id,
              name: "COLUMN_4",
              originalName: "date",
            },
          ],
        },
        settings,
      };

      removeColumnFromCartesianChart(state, settings, "COLUMN_1");

      expect(state.columns.map((c) => c.name)).toEqual([
        "COLUMN_2",
        "COLUMN_3",
        "COLUMN_4",
      ]);
      expect(state.columnValuesMapping).toEqual({
        COLUMN_2: [
          { sourceId: "card:1", name: "COLUMN_2", originalName: "created_at" },
        ],
        COLUMN_3: [
          { sourceId: "card:2", name: "COLUMN_3", originalName: "avg" },
        ],
        COLUMN_4: [
          { sourceId: "card:2", name: "COLUMN_4", originalName: "date" },
        ],
      });
      expect(state.settings).toEqual({
        "graph.metrics": ["COLUMN_3"],
        "graph.dimensions": ["COLUMN_2", "COLUMN_4"],
      });
    });

    it("should remove a dimension from a single series chart", () => {
      const settings = {
        "graph.metrics": ["COLUMN_1"],
        "graph.dimensions": ["COLUMN_2"],
      };
      const state: VisualizerVizDefinitionWithColumns = {
        display: "bar",
        columns: [
          { ...metric1, name: "COLUMN_1" },
          { ...dimension1, name: "COLUMN_2" },
        ],
        columnValuesMapping: {
          COLUMN_1: [
            {
              sourceId: dataSource1.id,
              name: "COLUMN_1",
              originalName: "count",
            },
          ],
          COLUMN_2: [
            {
              sourceId: dataSource1.id,
              name: "COLUMN_2",
              originalName: "created_at",
            },
          ],
        },
        settings,
      };

      removeColumnFromCartesianChart(state, settings, "COLUMN_2");

      expect(state.columns.map((c) => c.name)).toEqual(["COLUMN_1"]);
      expect(state.columnValuesMapping).toEqual({
        COLUMN_1: [
          { sourceId: "card:1", name: "COLUMN_1", originalName: "count" },
        ],
      });
      expect(state.settings).toEqual({
        "graph.metrics": ["COLUMN_1"],
        "graph.dimensions": [],
      });
    });

    it("should remove a dimension from a multi series chart", () => {
      const settings = {
        "graph.metrics": ["COLUMN_1", "COLUMN_3"],
        "graph.dimensions": ["COLUMN_2", "COLUMN_4"],
      };
      const state: VisualizerVizDefinitionWithColumns = {
        display: "bar",
        columns: [
          { ...metric1, name: "COLUMN_1" },
          { ...dimension1, name: "COLUMN_2" },
          { ...metric2, name: "COLUMN_3" },
          { ...dimension2, name: "COLUMN_4" },
        ],
        columnValuesMapping: {
          COLUMN_1: [
            {
              sourceId: dataSource1.id,
              name: "COLUMN_1",
              originalName: "count",
            },
          ],
          COLUMN_2: [
            {
              sourceId: dataSource1.id,
              name: "COLUMN_2",
              originalName: "created_at",
            },
          ],
          COLUMN_3: [
            {
              sourceId: dataSource2.id,
              name: "COLUMN_3",
              originalName: "avg",
            },
          ],
          COLUMN_4: [
            {
              sourceId: dataSource2.id,
              name: "COLUMN_4",
              originalName: "date",
            },
          ],
        },
        settings,
      };

      removeColumnFromCartesianChart(state, settings, "COLUMN_2");

      expect(state.columns.map((c) => c.name)).toEqual([
        "COLUMN_1",
        "COLUMN_3",
        "COLUMN_4",
      ]);
      expect(state.columnValuesMapping).toEqual({
        COLUMN_1: [
          { sourceId: "card:1", name: "COLUMN_1", originalName: "count" },
        ],
        COLUMN_3: [
          { sourceId: "card:2", name: "COLUMN_3", originalName: "avg" },
        ],
        COLUMN_4: [
          { sourceId: "card:2", name: "COLUMN_4", originalName: "date" },
        ],
      });
      expect(state.settings).toEqual({
        "graph.metrics": ["COLUMN_1", "COLUMN_3"],
        "graph.dimensions": ["COLUMN_4"],
      });
    });
  });

  describe("combineWithCartesianChart", () => {
    it("should add metric and dimension columns", () => {
      const settings = {
        "graph.metrics": ["COLUMN_1"],
        "graph.dimensions": ["COLUMN_2"],
      };
      const state: VisualizerVizDefinitionWithColumns = {
        display: "bar",
        columns: [
          createMockNumericColumn({ name: "COLUMN_1", display_name: "Count" }),
          createMockDatetimeColumn({
            name: "COLUMN_2",
            display_name: "Created At",
          }),
        ],
        columnValuesMapping: {
          COLUMN_1: [
            { sourceId: "card:1", name: "COLUMN_1", originalName: "Count" },
          ],
          COLUMN_2: [
            {
              sourceId: "card:1",
              name: "COLUMN_2",
              originalName: "Created At",
            },
          ],
        },
        settings,
      };

      const newMetricColumn = createMockNumericColumn({
        name: "AVG",
        display_name: "Average",
      });
      const newDimensionColumn = createMockDatetimeColumn({
        name: "DATE",
        display_name: "Date",
      });

      const nextState = _.clone(state);
      combineWithCartesianChart(
        nextState,
        settings,
        createMockDataset({
          data: { cols: [newMetricColumn, newDimensionColumn] },
        }),
        createDataSource("card", 2, "Card 2"),
      );

      expect(nextState.columns.map((col) => col.name)).toEqual([
        "COLUMN_1",
        "COLUMN_2",
        "COLUMN_3",
        "COLUMN_4",
      ]);
      expect(nextState.columnValuesMapping).toEqual({
        ...state.columnValuesMapping,
        COLUMN_3: [
          { sourceId: "card:2", name: "COLUMN_3", originalName: "AVG" },
        ],
        COLUMN_4: [
          { sourceId: "card:2", name: "COLUMN_4", originalName: "DATE" },
        ],
      });
      expect(nextState.settings).toStrictEqual({
        ...state.settings,
        "graph.metrics": ["COLUMN_1", "COLUMN_3"],
        "graph.dimensions": ["COLUMN_2", "COLUMN_4"],
      });
    });

    it("should add multiple metrics and dimensions", () => {
      const settings = {
        "graph.metrics": ["COLUMN_1"],
        "graph.dimensions": ["COLUMN_2", "COLUMN_3"],
      };
      const state: VisualizerVizDefinitionWithColumns = {
        display: "bar",
        columns: [
          createMockNumericColumn({ name: "COLUMN_1", display_name: "Count" }),
          createMockDatetimeColumn({
            name: "COLUMN_2",
            display_name: "Created At",
          }),
          createMockCategoryColumn({
            name: "COLUMN_3",
            display_name: "Category",
          }),
        ],
        columnValuesMapping: {
          COLUMN_1: [
            { sourceId: "card:1", name: "COLUMN_1", originalName: "Count" },
          ],
          COLUMN_2: [
            {
              sourceId: "card:1",
              name: "COLUMN_2",
              originalName: "Created At",
            },
          ],
          COLUMN_3: [
            {
              sourceId: "card:1",
              name: "COLUMN_3",
              originalName: "Category",
            },
          ],
        },
        settings,
      };

      const newMetric1Column = createMockNumericColumn({
        name: "AVG",
        display_name: "Average",
      });
      const newMetric2Column = createMockNumericColumn({
        name: "MAX",
        display_name: "Max",
      });
      const newTimeDimensionColumn = createMockDatetimeColumn({
        name: "DATE",
        display_name: "Date",
      });
      const newCategoryDimensionColumn = createMockCategoryColumn({
        name: "CATEGORY",
        display_name: "Category",
      });

      const nextState = _.clone(state);
      combineWithCartesianChart(
        nextState,
        settings,
        createMockDataset({
          data: {
            cols: [
              newMetric1Column,
              newMetric2Column,
              newTimeDimensionColumn,
              newCategoryDimensionColumn,
            ],
          },
        }),
        createDataSource("card", 2, "Card 2"),
      );

      expect(nextState.columns.map((col) => col.name)).toEqual([
        "COLUMN_1",
        "COLUMN_2",
        "COLUMN_3",
        "COLUMN_4",
        "COLUMN_5",
        "COLUMN_6",
        "COLUMN_7",
      ]);
      expect(nextState.columnValuesMapping).toEqual({
        ...state.columnValuesMapping,
        COLUMN_4: [
          { sourceId: "card:2", name: "COLUMN_4", originalName: "AVG" },
        ],
        COLUMN_5: [
          { sourceId: "card:2", name: "COLUMN_5", originalName: "MAX" },
        ],
        COLUMN_6: [
          { sourceId: "card:2", name: "COLUMN_6", originalName: "DATE" },
        ],
        COLUMN_7: [
          { sourceId: "card:2", name: "COLUMN_7", originalName: "CATEGORY" },
        ],
      });
      expect(nextState.settings).toStrictEqual({
        ...state.settings,
        "graph.metrics": ["COLUMN_1", "COLUMN_4", "COLUMN_5"],
        "graph.dimensions": ["COLUMN_2", "COLUMN_3", "COLUMN_6", "COLUMN_7"],
      });
    });

    describe("dimension sorting based on x-axis scale", () => {
      it("should prioritize date dimensions when x-axis scale is timeseries", () => {
        const settings = createMockVisualizationSettings({
          "graph.metrics": ["COLUMN_1"],
          "graph.dimensions": ["COLUMN_2"],
          "graph.x_axis.scale": "timeseries",
        });
        const state: VisualizerVizDefinitionWithColumns = {
          display: "bar",
          columns: [
            createMockNumericColumn({
              name: "COLUMN_1",
              display_name: "Count",
            }),
            createMockCategoryColumn({
              name: "COLUMN_2",
              display_name: "Category",
            }),
          ],
          columnValuesMapping: {
            COLUMN_1: [
              { sourceId: "card:1", name: "COLUMN_1", originalName: "Count" },
            ],
            COLUMN_2: [
              {
                sourceId: "card:1",
                name: "COLUMN_2",
                originalName: "Category",
              },
            ],
          },
          settings,
        };

        const stringDimension = createMockCategoryColumn({
          name: "STRING_DIM",
          display_name: "String Dimension",
        });
        const dateDimension = createMockDatetimeColumn({
          name: "DATE_DIM",
          display_name: "Date Dimension",
        });
        const anotherStringDimension = createMockCategoryColumn({
          name: "ANOTHER_STRING",
          display_name: "Another String",
        });

        const nextState = _.clone(state);
        combineWithCartesianChart(
          nextState,
          settings,
          createMockDataset({
            data: {
              cols: [stringDimension, anotherStringDimension, dateDimension],
            },
          }),
          createDataSource("card", 2, "Card 2"),
        );

        const addedDimensions =
          nextState.settings["graph.dimensions"]?.slice(1) || [];
        expect(addedDimensions[0]).toEqual("COLUMN_3");
        const column3 = nextState.columns.find(
          (col) => col.name === "COLUMN_3",
        );
        expect(column3?.display_name).toEqual("Date Dimension");
      });

      it("should prioritize numeric dimensions when x-axis scale is linear", () => {
        const settings = createMockVisualizationSettings({
          "graph.metrics": ["COLUMN_1"],
          "graph.dimensions": ["COLUMN_2"],
          "graph.x_axis.scale": "linear",
        });
        const state: VisualizerVizDefinitionWithColumns = {
          display: "bar",
          columns: [
            createMockNumericColumn({
              name: "COLUMN_1",
              display_name: "Count",
            }),
            createMockCategoryColumn({
              name: "COLUMN_2",
              display_name: "Category",
            }),
          ],
          columnValuesMapping: {
            COLUMN_1: [
              { sourceId: "card:1", name: "COLUMN_1", originalName: "Count" },
            ],
            COLUMN_2: [
              {
                sourceId: "card:1",
                name: "COLUMN_2",
                originalName: "Category",
              },
            ],
          },
          settings,
        };

        const stringDimension = createMockCategoryColumn({
          name: "STRING_DIM",
          display_name: "String Dimension",
        });
        const dateDimension = createMockDatetimeColumn({
          name: "DATE_DIM",
          display_name: "Date Dimension",
        });
        // Create a numeric dimension that won't be filtered out as a metric
        const numericDimension = createMockNumericColumn({
          name: "NUMERIC_DIM",
          display_name: "Numeric Dimension",
          semantic_type: "type/PK", // Primary keys are not metrics
        });

        const nextState = _.clone(state);
        combineWithCartesianChart(
          nextState,
          settings,
          createMockDataset({
            data: {
              cols: [stringDimension, dateDimension, numericDimension],
            },
          }),
          createDataSource("card", 2, "Card 2"),
        );

        const addedDimensions =
          nextState.settings["graph.dimensions"]?.slice(1) || [];
        expect(addedDimensions[0]).toEqual("COLUMN_3");
        const column3 = nextState.columns.find(
          (col) => col.name === "COLUMN_3",
        );
        expect(column3?.display_name).toEqual("Numeric Dimension");
      });

      it("should prioritize string dimensions when x-axis scale is ordinal", () => {
        const settings = createMockVisualizationSettings({
          "graph.metrics": ["COLUMN_1"],
          "graph.dimensions": ["COLUMN_2"],
          "graph.x_axis.scale": "ordinal",
        });
        const state: VisualizerVizDefinitionWithColumns = {
          display: "bar",
          columns: [
            createMockNumericColumn({
              name: "COLUMN_1",
              display_name: "Count",
            }),
            createMockDatetimeColumn({
              name: "COLUMN_2",
              display_name: "Date",
            }),
          ],
          columnValuesMapping: {
            COLUMN_1: [
              { sourceId: "card:1", name: "COLUMN_1", originalName: "Count" },
            ],
            COLUMN_2: [
              {
                sourceId: "card:1",
                name: "COLUMN_2",
                originalName: "Date",
              },
            ],
          },
          settings,
        };

        const dateDimension = createMockDatetimeColumn({
          name: "DATE_DIM",
          display_name: "Date Dimension",
        });
        const stringDimension = createMockCategoryColumn({
          name: "STRING_DIM",
          display_name: "String Dimension",
        });
        const anotherDateDimension = createMockDatetimeColumn({
          name: "ANOTHER_DATE",
          display_name: "Another Date",
        });

        const nextState = _.clone(state);
        combineWithCartesianChart(
          nextState,
          settings,
          createMockDataset({
            data: {
              cols: [dateDimension, anotherDateDimension, stringDimension],
            },
          }),
          createDataSource("card", 2, "Card 2"),
        );

        const addedDimensions =
          nextState.settings["graph.dimensions"]?.slice(1) || [];
        expect(addedDimensions[0]).toEqual("COLUMN_3");
        const column3 = nextState.columns.find(
          (col) => col.name === "COLUMN_3",
        );
        expect(column3?.display_name).toEqual("String Dimension");
      });

      it("should maintain original order when x-axis scale is undefined", () => {
        const settings = createMockVisualizationSettings({
          "graph.metrics": ["COLUMN_1"],
          "graph.dimensions": ["COLUMN_2"],
        });
        const state: VisualizerVizDefinitionWithColumns = {
          display: "bar",
          columns: [
            createMockNumericColumn({
              name: "COLUMN_1",
              display_name: "Count",
            }),
            createMockCategoryColumn({
              name: "COLUMN_2",
              display_name: "Category",
            }),
          ],
          columnValuesMapping: {
            COLUMN_1: [
              { sourceId: "card:1", name: "COLUMN_1", originalName: "Count" },
            ],
            COLUMN_2: [
              {
                sourceId: "card:1",
                name: "COLUMN_2",
                originalName: "Category",
              },
            ],
          },
          settings,
        };

        const stringDimension = createMockCategoryColumn({
          name: "STRING_DIM",
          display_name: "String Dimension",
        });
        const dateDimension = createMockDatetimeColumn({
          name: "DATE_DIM",
          display_name: "Date Dimension",
        });
        const anotherStringDimension = createMockCategoryColumn({
          name: "ANOTHER_STRING",
          display_name: "Another String",
        });

        const nextState = _.clone(state);
        combineWithCartesianChart(
          nextState,
          settings,
          createMockDataset({
            data: {
              cols: [stringDimension, dateDimension, anotherStringDimension],
            },
          }),
          createDataSource("card", 2, "Card 2"),
        );

        const addedDimensions =
          nextState.settings["graph.dimensions"]?.slice(1) || [];
        expect(addedDimensions).toEqual(["COLUMN_3", "COLUMN_4", "COLUMN_5"]);
        const column3 = nextState.columns.find(
          (col) => col.name === "COLUMN_3",
        );
        const column4 = nextState.columns.find(
          (col) => col.name === "COLUMN_4",
        );
        const column5 = nextState.columns.find(
          (col) => col.name === "COLUMN_5",
        );
        expect(column3?.display_name).toEqual("String Dimension");
        expect(column4?.display_name).toEqual("Date Dimension");
        expect(column5?.display_name).toEqual("Another String");
      });
    });
  });

  describe("scatter bubble size", () => {
    const dataSource = createDataSource("card", 1, "Card 1");

    const column1 = createMockNumericColumn({ id: 1, name: "count" });
    const column1Ref = createVisualizerColumnReference(dataSource, column1, []);

    const column2 = createMockNumericColumn({ id: 2, name: "sum" });
    const column2Ref = createVisualizerColumnReference(dataSource, column2, [
      column1Ref,
    ]);

    it("should add a column", () => {
      const state: VisualizerVizDefinitionWithColumns = {
        columns: [],
        settings: {},
        columnValuesMapping: {},
        display: "scatter",
      };

      replaceMetricColumnAsScatterBubbleSize(
        state,
        {},
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
      const state: VisualizerVizDefinitionWithColumns = {
        columns: [],
        settings: {},
        columnValuesMapping: {},
        display: "scatter",
      };

      // Add the first column
      replaceMetricColumnAsScatterBubbleSize(
        state,
        {},
        column1,
        column1Ref,
        dataSource,
      );

      // Replace the first column with the second column
      replaceMetricColumnAsScatterBubbleSize(
        state,
        { "scatter.bubble": "COLUMN_1" },
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
      const state: VisualizerVizDefinitionWithColumns = {
        columns: [],
        settings: {},
        columnValuesMapping: {},
        display: "scatter",
      };

      // Add the first column as the Y axis
      addMetricColumnToCartesianChart(
        state,
        {},
        copyColumn(column1Ref.name, column1, dataSource.name, []),
        column1Ref,
        dataSource,
      );

      // Add it as the bubble size too
      replaceMetricColumnAsScatterBubbleSize(
        state,
        { "graph.metrics": ["COLUMN_1"] },
        column1,
        column1Ref,
        dataSource,
      );

      // Add the second column
      replaceMetricColumnAsScatterBubbleSize(
        state,
        {
          "graph.metrics": ["COLUMN_1"],
          "scatter.bubble": "COLUMN_1",
        },
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
      const state: VisualizerVizDefinitionWithColumns = {
        columns: [],
        settings: {},
        columnValuesMapping: {},
        display: "scatter",
      };

      // Add the first column as the Y axis
      addMetricColumnToCartesianChart(
        state,
        {},
        copyColumn(column1Ref.name, column1, dataSource.name, []),
        column1Ref,
        dataSource,
      );

      // Add it as the bubble size too
      replaceMetricColumnAsScatterBubbleSize(
        state,
        { "graph.metrics": ["COLUMN_1"] },
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
      const state: VisualizerVizDefinitionWithColumns = {
        columns: [],
        settings: {},
        columnValuesMapping: {},
        display: "scatter",
      };

      const copiedColumn1 = copyColumn(
        column1Ref.name,
        column1,
        dataSource.name,
        [],
      );

      // Add the first column as the Y axis
      addMetricColumnToCartesianChart(
        state,
        {},
        copiedColumn1,
        column1Ref,
        dataSource,
      );

      // Add it as the bubble size too
      replaceMetricColumnAsScatterBubbleSize(
        state,
        { "graph.metrics": ["COLUMN_1"] },
        copiedColumn1,
        column1Ref,
        dataSource,
      );

      // Remove the first column as a metric
      removeColumnFromCartesianChart(
        state,
        { "graph.metrics": ["COLUMN_1"], "scatter.bubble": "COLUMN_1" },
        "COLUMN_1",
      );

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
        "graph.metrics": [],
      });
    });

    it("should not delete a column that's used as a dimension", () => {
      const state: VisualizerVizDefinitionWithColumns = {
        columns: [],
        settings: {},
        columnValuesMapping: {},
        display: "scatter",
      };

      // Add the first column as the X axis
      addDimensionColumnToCartesianChart(
        state,
        {},
        copyColumn(column1Ref.name, column1, dataSource.name, []),
        column1Ref,
        dataSource,
      );

      // Add it as the bubble size too
      replaceMetricColumnAsScatterBubbleSize(
        state,
        { "graph.metrics": ["COLUMN_1"] },
        column1,
        column1Ref,
        dataSource,
      );

      // Add the second column
      replaceMetricColumnAsScatterBubbleSize(
        state,
        { "graph.metrics": ["COLUMN_1"], "scatter.bubble": "COLUMN_1" },
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
