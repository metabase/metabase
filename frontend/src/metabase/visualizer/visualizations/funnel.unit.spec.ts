import _ from "underscore";

import {
  createMockCategoryColumn,
  createMockDataset,
  createMockNumericColumn,
} from "metabase-types/api/mocks";
import type { VisualizerVizDefinitionWithColumns } from "metabase-types/store/visualizer";

import {
  createDataSource,
  createDataSourceNameRef,
  createVisualizerColumnReference,
} from "../utils";

import {
  addColumnToFunnel,
  combineWithFunnel,
  removeColumnFromFunnel,
} from "./funnel";

describe("funnel", () => {
  const dataSource = createDataSource("card", 1, "Q1");

  const metricColumn = createMockNumericColumn({ id: 1, name: "count" });
  const metricColumnRef = createVisualizerColumnReference(
    dataSource,
    metricColumn,
    [],
  );

  const metricColumn2 = createMockNumericColumn({ id: 2, name: "sum" });

  const dimensionColumn = createMockCategoryColumn({
    id: 3,
    name: "category",
  });
  const dimensionColumnRef = createVisualizerColumnReference(
    dataSource,
    dimensionColumn,
    [metricColumnRef],
  );

  const dimensionColumn2 = createMockCategoryColumn({
    id: 4,
    name: "category2",
  });

  const dataset = createMockDataset({
    data: {
      cols: [metricColumn, metricColumn2, dimensionColumn, dimensionColumn2],
    },
  });

  const scalarDataset1 = createMockDataset({
    data: {
      cols: [metricColumn],
      rows: [[500]],
    },
  });

  const dataSource2 = createDataSource("card", 2, "Q2");
  const scalarDataset2 = createMockDataset({
    data: {
      cols: [metricColumn2],
      rows: [[1000]],
    },
  });

  describe("addColumnToFunnel", () => {
    describe("regular funnel", () => {
      it("should add a metric column", () => {
        const state: VisualizerVizDefinitionWithColumns = {
          display: "funnel",
          columns: [],
          settings: {},
          columnValuesMapping: {},
        };

        addColumnToFunnel(
          state,
          {},
          {},
          { ...metricColumn, name: "COLUMN_1" },
          metricColumnRef,
          dataset,
          dataSource,
        );

        expect(state.columns.map((c) => c.name)).toEqual(["COLUMN_1"]);
        expect(state.columnValuesMapping).toEqual({
          COLUMN_1: [
            { sourceId: "card:1", name: "COLUMN_1", originalName: "count" },
          ],
        });
        expect(state.settings).toEqual({ "funnel.metric": "COLUMN_1" });
      });

      it("should not change the metric column if it's already set", () => {
        const settings = { "funnel.metric": "COLUMN_1" };
        const state: VisualizerVizDefinitionWithColumns = {
          display: "funnel",
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

        addColumnToFunnel(
          state,
          settings,
          {},
          { ...metricColumn2, name: "COLUMN_2" },
          createVisualizerColumnReference(dataSource, metricColumn2, [
            metricColumnRef,
          ]),
          dataset,
          dataSource,
        );

        // TODO Enable when VIZ-652 is closed
        // expect(state.columns.map((c) => c.name)).toEqual(["COLUMN_1"]);
        // expect(Object.keys(state.columnValuesMapping)).toEqual(["COLUMN_1"]);
        expect(state.settings).toEqual({ "funnel.metric": "COLUMN_1" });
      });

      it("should add a dimension column", () => {
        const settings = { "funnel.metric": "COLUMN_1" };
        const state: VisualizerVizDefinitionWithColumns = {
          display: "funnel",
          columns: [{ ...metricColumn, name: "COLUMN_1" }],
          settings,
          columnValuesMapping: {
            COLUMN_1: [
              { sourceId: "card:1", name: "COLUMN_1", originalName: "count" },
            ],
          },
        };

        addColumnToFunnel(
          state,
          settings,
          {},
          { ...dimensionColumn, name: "COLUMN_2" },
          dimensionColumnRef,
          dataset,
          dataSource,
        );

        expect(state.columns.map((c) => c.name)).toEqual([
          "COLUMN_1",
          "COLUMN_2",
        ]);
        expect(state.columnValuesMapping).toEqual({
          COLUMN_1: [
            { sourceId: "card:1", name: "COLUMN_1", originalName: "count" },
          ],
          COLUMN_2: [
            { sourceId: "card:1", name: "COLUMN_2", originalName: "category" },
          ],
        });
        expect(state.settings).toEqual({
          "funnel.metric": "COLUMN_1",
          "funnel.dimension": "COLUMN_2",
        });
      });

      it("should not change the dimension column if it's already set", () => {
        const settings = { "funnel.dimension": "COLUMN_1" };
        const state: VisualizerVizDefinitionWithColumns = {
          display: "funnel",
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

        addColumnToFunnel(
          state,
          settings,
          {},
          { ...dimensionColumn2, name: "COLUMN_2" },
          createVisualizerColumnReference(dataSource, dimensionColumn2, [
            dimensionColumnRef,
          ]),
          dataset,
          dataSource,
        );

        // TODO Enable when VIZ-652 is closed
        // expect(state.columns.map((c) => c.name)).toEqual(["COLUMN_1"]);
        // expect(Object.keys(state.columnValuesMapping)).toEqual(["COLUMN_1"]);
        expect(state.settings).toEqual({ "funnel.dimension": "COLUMN_1" });
      });
    });

    describe("scalar funnel", () => {
      it("should start a scalar funnel from clean state", () => {
        const state: VisualizerVizDefinitionWithColumns = {
          display: "funnel",
          columns: [],
          settings: {},
          columnValuesMapping: {},
        };

        addColumnToFunnel(
          state,
          {},
          {
            [dataSource.id]: scalarDataset1,
          },
          { ...metricColumn, name: "COLUMN_1" },
          metricColumnRef,
          scalarDataset1,
          dataSource,
        );

        expect(state.columns.map((c) => c.name)).toEqual([
          "METRIC",
          "DIMENSION",
        ]);
        expect(state.columnValuesMapping).toEqual({
          METRIC: [
            { sourceId: "card:1", name: "COLUMN_1", originalName: "count" },
          ],
          DIMENSION: [createDataSourceNameRef(dataSource.id)],
        });
      });

      it("should add a new column to an existing scalar funnel", () => {
        const settings = {
          "funnel.metric": "METRIC",
          "funnel.dimension": "DIMENSION",
        };
        const state: VisualizerVizDefinitionWithColumns = {
          display: "funnel",
          columns: [
            createMockNumericColumn({ name: "METRIC" }),
            createMockCategoryColumn({ name: "DIMENSION" }),
          ],
          settings,
          columnValuesMapping: {
            METRIC: [
              { sourceId: "card:1", name: "COLUMN_1", originalName: "count" },
            ],
            DIMENSION: [createDataSourceNameRef(dataSource.id)],
          },
        };

        addColumnToFunnel(
          state,
          settings,
          {
            [dataSource.id]: scalarDataset1,
            [dataSource2.id]: scalarDataset2,
          },
          { ...metricColumn2, name: "COLUMN_2" },
          createVisualizerColumnReference(dataSource, metricColumn2, [
            metricColumnRef,
            dimensionColumnRef,
          ]),
          scalarDataset2,
          dataSource2,
        );

        expect(state.columns.map((c) => c.name)).toEqual([
          "METRIC",
          "DIMENSION",
        ]);
        expect(state.columnValuesMapping).toEqual({
          METRIC: [
            { sourceId: "card:1", name: "COLUMN_1", originalName: "count" },
            { sourceId: "card:2", name: "COLUMN_2", originalName: "sum" },
          ],
          DIMENSION: [
            createDataSourceNameRef(dataSource.id),
            createDataSourceNameRef(dataSource2.id),
          ],
        });
        expect(state.settings).toEqual({
          "funnel.metric": "METRIC",
          "funnel.dimension": "DIMENSION",
        });
      });
    });
  });

  describe("removeColumnFromFunnel", () => {
    describe("regular funnel", () => {
      it("should remove a metric column", () => {
        const settings = { "funnel.metric": "COLUMN_1" };
        const state: VisualizerVizDefinitionWithColumns = {
          display: "funnel",
          columns: [{ ...metricColumn, name: "COLUMN_1" }],
          settings,
          columnValuesMapping: {
            COLUMN_1: [
              { sourceId: "card:1", name: "COLUMN_1", originalName: "count" },
            ],
          },
        };

        removeColumnFromFunnel(state, settings, "COLUMN_1");

        expect(state.columns.map((c) => c.name)).toEqual([]);
        expect(state.columnValuesMapping).toEqual({});
        expect(state.settings).toEqual({});
      });

      it("should remove a dimension column", () => {
        const settings = { "funnel.dimension": "COLUMN_1" };
        const state: VisualizerVizDefinitionWithColumns = {
          display: "funnel",
          columns: [{ ...dimensionColumn, name: "COLUMN_1" }],
          settings,
          columnValuesMapping: {
            COLUMN_1: [
              { sourceId: "card:1", name: "COLUMN_1", originalName: "count" },
            ],
          },
        };

        removeColumnFromFunnel(state, settings, "COLUMN_1");

        expect(state.columns.map((c) => c.name)).toEqual([]);
        expect(state.columnValuesMapping).toEqual({});
        expect(state.settings).toEqual({});
      });

      it("should do nothing if a column isn't used", () => {
        const settings = { "funnel.metric": "COLUMN_1" };
        const state: VisualizerVizDefinitionWithColumns = {
          display: "funnel",
          columns: [{ ...metricColumn, name: "COLUMN_1" }],
          settings,
          columnValuesMapping: {
            COLUMN_1: [
              { sourceId: "card:1", name: "COLUMN_1", originalName: "count" },
            ],
          },
        };

        removeColumnFromFunnel(state, settings, "COLUMN_2");

        expect(state.columns.map((c) => c.name)).toEqual(["COLUMN_1"]);
        expect(state.columnValuesMapping).toEqual({
          COLUMN_1: [
            { sourceId: "card:1", name: "COLUMN_1", originalName: "count" },
          ],
        });
        expect(state.settings).toEqual({ "funnel.metric": "COLUMN_1" });
      });
    });

    describe("scalar funnel", () => {
      const initialState: VisualizerVizDefinitionWithColumns = {
        display: "funnel",
        columns: [
          createMockNumericColumn({ name: "METRIC" }),
          createMockCategoryColumn({ name: "DIMENSION" }),
        ],
        settings: {
          "card.title": "My funnel",
          "funnel.metric": "METRIC",
          "funnel.dimension": "DIMENSION",
        },
        columnValuesMapping: {
          METRIC: [
            { sourceId: "card:1", name: "COLUMN_1", originalName: "count" },
            { sourceId: "card:2", name: "COLUMN_2", originalName: "sum" },
          ],
          DIMENSION: [
            createDataSourceNameRef(dataSource.id),
            createDataSourceNameRef(dataSource2.id),
          ],
        },
      };

      it("should reset state when removing a metric column", () => {
        const state = _.clone(initialState);
        const settings = _.clone(initialState.settings);

        removeColumnFromFunnel(state, settings, "METRIC");

        expect(state.columns.map((c) => c.name)).toEqual([]);
        expect(state.columnValuesMapping).toEqual({});
        expect(state.settings).toEqual({ "card.title": "My funnel" });
      });

      it("should reset state when removing a dimension column", () => {
        const state = _.clone(initialState);
        const settings = _.clone(initialState.settings);

        removeColumnFromFunnel(state, settings, "DIMENSION");

        expect(state.columns.map((c) => c.name)).toEqual([]);
        expect(state.columnValuesMapping).toEqual({});
        expect(state.settings).toEqual({ "card.title": "My funnel" });
      });

      it("should remove a funnel step", () => {
        const state = _.clone(initialState);
        const settings = _.clone(initialState.settings);

        removeColumnFromFunnel(state, settings, "COLUMN_2");

        expect(state.columns.map((c) => c.name)).toEqual([
          "METRIC",
          "DIMENSION",
        ]);
        expect(state.columnValuesMapping).toEqual({
          METRIC: [
            { sourceId: "card:1", name: "COLUMN_1", originalName: "count" },
          ],
          DIMENSION: [createDataSourceNameRef(dataSource.id)],
        });
        expect(state.settings).toEqual({
          "card.title": "My funnel",
          "funnel.metric": "METRIC",
          "funnel.dimension": "DIMENSION",
        });
      });
    });
  });

  describe("combineWithFunnel", () => {
    describe("regular funnel", () => {
      it("should set funnel.metric if it's undefined and there's one metric column", () => {
        const settings = { "funnel.dimension": "COLUMN_1" };
        const state: VisualizerVizDefinitionWithColumns = {
          display: "funnel",
          columns: [{ ...dimensionColumn, name: "COLUMN_1" }],
          settings,
          columnValuesMapping: {
            COLUMN_1: [
              {
                sourceId: "card:1",
                name: "COLUMN_1",
                originalName: "category",
              },
            ],
          },
        };

        combineWithFunnel(
          state,
          settings,
          createMockDataset({
            data: {
              cols: [metricColumn2, dimensionColumn2],
            },
          }),
          dataSource2,
        );

        expect(state.columns.map((c) => c.name)).toEqual([
          "COLUMN_1",
          "COLUMN_2",
        ]);
        expect(state.columnValuesMapping).toEqual({
          COLUMN_1: [
            { sourceId: "card:1", name: "COLUMN_1", originalName: "category" },
          ],
          COLUMN_2: [
            { sourceId: "card:2", name: "COLUMN_2", originalName: "sum" },
          ],
        });
        expect(state.settings).toEqual({
          "funnel.metric": "COLUMN_2",
          "funnel.dimension": "COLUMN_1",
        });
      });

      it("should not change funnel.metric if it's already set", () => {
        const settings = { "funnel.metric": "COLUMN_1" };
        const state: VisualizerVizDefinitionWithColumns = {
          display: "funnel",
          columns: [{ ...metricColumn, name: "COLUMN_1" }],
          settings,
          columnValuesMapping: {
            COLUMN_1: [
              { sourceId: "card:1", name: "COLUMN_1", originalName: "count" },
            ],
          },
        };

        combineWithFunnel(
          state,
          settings,
          createMockDataset({
            data: { cols: [metricColumn2] },
          }),
          dataSource2,
        );

        expect(state.columns.map((c) => c.name)).toEqual(["COLUMN_1"]);
        expect(Object.keys(state.columnValuesMapping)).toEqual(["COLUMN_1"]);
        expect(state.settings).toEqual({ "funnel.metric": "COLUMN_1" });
      });

      it("shouldn't set funnel.metric if it's undefined and there are multiple metric columns", () => {
        const settings = { "funnel.dimension": "COLUMN_1" };
        const state: VisualizerVizDefinitionWithColumns = {
          display: "funnel",
          columns: [{ ...dimensionColumn, name: "COLUMN_1" }],
          settings,
          columnValuesMapping: {
            COLUMN_1: [
              { sourceId: "card:1", name: "COLUMN_1", originalName: "count" },
            ],
          },
        };

        combineWithFunnel(
          state,
          settings,
          createMockDataset({
            data: { cols: [metricColumn, metricColumn2] },
          }),
          dataSource2,
        );

        expect(state.columns.map((c) => c.name)).toEqual(["COLUMN_1"]);
        expect(Object.keys(state.columnValuesMapping)).toEqual(["COLUMN_1"]);
        expect(state.settings).toEqual({ "funnel.dimension": "COLUMN_1" });
      });

      it("should set funnel.dimension if it's undefined and there's one dimension column", () => {
        const settings = { "funnel.metric": "COLUMN_1" };
        const state: VisualizerVizDefinitionWithColumns = {
          display: "funnel",
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

        combineWithFunnel(
          state,
          settings,
          createMockDataset({
            data: { cols: [dimensionColumn2] },
          }),
          dataSource2,
        );

        expect(state.columns.map((c) => c.name)).toEqual([
          "COLUMN_1",
          "COLUMN_2",
        ]);
        expect(state.columnValuesMapping).toEqual({
          COLUMN_1: [
            { sourceId: "card:1", name: "COLUMN_1", originalName: "count" },
          ],
          COLUMN_2: [
            { sourceId: "card:2", name: "COLUMN_2", originalName: "category2" },
          ],
        });
        expect(state.settings).toEqual({
          "funnel.metric": "COLUMN_1",
          "funnel.dimension": "COLUMN_2",
        });
      });

      it("should not set funnel.dimension if it's undefined and there are multiple dimension columns", () => {
        const settings = { "funnel.metric": "COLUMN_1" };
        const state: VisualizerVizDefinitionWithColumns = {
          display: "funnel",
          columns: [{ ...metricColumn, name: "COLUMN_1" }],
          settings,
          columnValuesMapping: {
            COLUMN_1: [
              { sourceId: "card:1", name: "COLUMN_1", originalName: "count" },
            ],
          },
        };

        combineWithFunnel(
          state,
          settings,
          createMockDataset({
            data: { cols: [dimensionColumn, dimensionColumn2] },
          }),
          dataSource2,
        );

        expect(state.columns.map((c) => c.name)).toEqual(["COLUMN_1"]);
        expect(Object.keys(state.columnValuesMapping)).toEqual(["COLUMN_1"]);
        expect(state.settings).toEqual({
          "funnel.metric": "COLUMN_1",
        });
      });

      it("should not change funnel.dimension if it's already set", () => {
        const settings = { "funnel.dimension": "COLUMN_1" };
        const state: VisualizerVizDefinitionWithColumns = {
          display: "funnel",
          columns: [{ ...dimensionColumn, name: "COLUMN_1" }],
          settings,
          columnValuesMapping: {
            COLUMN_1: [
              {
                sourceId: "card:1",
                name: "COLUMN_1",
                originalName: "category",
              },
            ],
          },
        };

        combineWithFunnel(
          state,
          settings,
          createMockDataset({
            data: { cols: [dimensionColumn2] },
          }),
          dataSource2,
        );

        expect(state.columns.map((c) => c.name)).toEqual(["COLUMN_1"]);
        expect(Object.keys(state.columnValuesMapping)).toEqual(["COLUMN_1"]);
        expect(state.settings).toEqual({ "funnel.dimension": "COLUMN_1" });
      });
    });

    describe("scalar funnel", () => {
      const initialSettings = {
        "card.title": "My funnel",
        "funnel.metric": "METRIC",
        "funnel.dimension": "DIMENSION",
      };
      const initialState: VisualizerVizDefinitionWithColumns = {
        display: "funnel",
        columns: [
          createMockNumericColumn({ name: "METRIC" }),
          createMockCategoryColumn({ name: "DIMENSION" }),
        ],
        settings: initialSettings,
        columnValuesMapping: {
          METRIC: [
            { sourceId: "card:1", name: "COLUMN_1", originalName: "count" },
            { sourceId: "card:2", name: "COLUMN_2", originalName: "sum" },
          ],
          DIMENSION: [
            createDataSourceNameRef(dataSource.id),
            createDataSourceNameRef(dataSource2.id),
          ],
        },
      };

      it("should start a scalar funnel from clean state", () => {
        const state: VisualizerVizDefinitionWithColumns = {
          display: "funnel",
          columns: [],
          settings: {},
          columnValuesMapping: {},
        };

        combineWithFunnel(state, {}, scalarDataset1, dataSource);

        expect(state.columns.map((c) => c.name)).toEqual([
          "METRIC",
          "DIMENSION",
        ]);
        expect(state.columnValuesMapping).toEqual({
          METRIC: [
            { sourceId: "card:1", name: "COLUMN_1", originalName: "count" },
          ],
          DIMENSION: [createDataSourceNameRef(dataSource.id)],
        });
      });

      it("should add a scalar dataset to an existing scalar funnel", () => {
        const state = _.clone(initialState);

        combineWithFunnel(state, initialSettings, scalarDataset2, dataSource2);

        expect(state.columns.map((c) => c.name)).toEqual([
          "METRIC",
          "DIMENSION",
        ]);
        expect(state.columnValuesMapping).toEqual({
          METRIC: [
            { sourceId: "card:1", name: "COLUMN_1", originalName: "count" },
            { sourceId: "card:2", name: "COLUMN_2", originalName: "sum" },
          ],
          DIMENSION: [
            createDataSourceNameRef(dataSource.id),
            createDataSourceNameRef(dataSource2.id),
          ],
        });
        expect(state.settings).toEqual({
          "card.title": "My funnel",
          "funnel.metric": "METRIC",
          "funnel.dimension": "DIMENSION",
        });
      });

      it("should do nothing if the dataset isn't compatible", () => {
        const state = _.clone(initialState);

        combineWithFunnel(
          state,
          initialSettings,
          createMockDataset(),
          dataSource,
        );

        expect(state).toStrictEqual(initialState);
      });
    });
  });
});
