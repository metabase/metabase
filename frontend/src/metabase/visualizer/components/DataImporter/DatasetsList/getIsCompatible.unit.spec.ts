import registerVisualizations from "metabase/visualizations/register";
import type { Field } from "metabase-types/api";
import {
  createMockCategoryColumn,
  createMockDataset,
  createMockDatetimeColumn,
  createMockField,
  createMockNumericColumn,
} from "metabase-types/api/mocks";

import { getIsCompatible } from "./getIsCompatible";

registerVisualizations();

describe("getIsCompatible", () => {
  it("should return false if a target data source doesn't have columns", () => {
    const result = getIsCompatible({
      currentDataset: {
        display: "bar",
        columns: [createMockNumericColumn(), createMockCategoryColumn()],
        settings: {},
        computedSettings: {},
      },
      targetDataset: { fields: [] },
      datasets: {},
    });
    expect(result).toBe(false);
  });

  describe("pie", () => {
    it("should always return false", () => {
      const columns = [
        createMockNumericColumn({ id: 1 }),
        createMockCategoryColumn({ id: 2 }),
      ];

      expect(
        getIsCompatible({
          currentDataset: {
            display: "pie",
            columns: columns,
            settings: {},
            computedSettings: {},
          },
          targetDataset: {
            fields: [
              createMockNumericField({ id: 1 }),
              createMockCategoryField({ id: 2 }),
            ],
          },
          datasets: {
            "1": createMockDataset({ data: { cols: columns } }),
          },
        }),
      ).toBe(false);
    });
  });

  describe("funnel", () => {
    it("should return true if a data source has one column", () => {
      const currentDataset = {
        display: "funnel" as const,
        columns: [],
        settings: {},
        computedSettings: {},
      };
      const dataset = createMockDataset({ data: { cols: [] } });

      // Can be used as a metric
      expect(
        getIsCompatible({
          currentDataset,
          targetDataset: { fields: [createMockNumericField()] },
          datasets: {
            "1": dataset,
            "2": createMockDataset({
              data: { cols: [createMockNumericColumn()] },
            }),
          },
        }),
      ).toBe(true);

      // Can be used as a dimension
      expect(
        getIsCompatible({
          currentDataset,
          targetDataset: { fields: [createMockCategoryField()] },
          datasets: {
            "1": dataset,
            "2": createMockDataset({
              data: { cols: [createMockCategoryColumn()] },
            }),
          },
        }),
      ).toBe(true);
    });

    it("should return true if a data source has one metric column and funnel has only a dimension", () => {
      const settings = {
        "funnel.dimension": "COLUMN_1",
      };
      const currentDataset = {
        display: "funnel" as const,
        columns: [createMockCategoryColumn({ id: 10, name: "COLUMN_1" })],
        settings,
        computedSettings: settings,
      };
      const dataset = createMockDataset({
        data: {
          cols: [createMockCategoryColumn({ id: 10, name: "COLUMN_1" })],
        },
      });

      expect(
        getIsCompatible({
          currentDataset,
          targetDataset: { fields: [createMockNumericField()] },
          datasets: {
            "1": dataset,
            "2": createMockDataset({
              data: { cols: [createMockNumericColumn()] },
            }),
          },
        }),
      ).toBe(true);
    });

    it("should return true if a data source has one dimension column and funnel has only a metric", () => {
      const settings = {
        "funnel.metric": "COLUMN_1",
      };
      const currentDataset = {
        display: "funnel" as const,
        columns: [createMockNumericColumn({ id: 10, name: "COLUMN_1" })],
        settings,
        computedSettings: settings,
      };
      const dataset = createMockDataset({
        data: { cols: [createMockNumericColumn({ id: 10, name: "COLUMN_1" })] },
      });

      expect(
        getIsCompatible({
          currentDataset,
          targetDataset: { fields: [createMockCategoryField()] },
          datasets: {
            "1": dataset,
            "2": createMockDataset({
              data: { cols: [createMockCategoryColumn()] },
            }),
          },
        }),
      ).toBe(true);
    });

    it("should return true if a data source has a metric and dimension for an empty funnel", () => {
      expect(
        getIsCompatible({
          currentDataset: {
            display: "funnel",
            columns: [],
            settings: {},
            computedSettings: {},
          },
          targetDataset: {
            fields: [
              createMockNumericField({ id: 1 }),
              createMockCategoryField({ id: 2 }),
            ],
          },
          datasets: {
            "1": createMockDataset({ data: { cols: [] } }),
            "2": createMockDataset({
              data: {
                cols: [
                  createMockNumericColumn({ id: 1 }),
                  createMockCategoryColumn({ id: 2 }),
                ],
              },
            }),
          },
        }),
      ).toBe(true);
    });
  });

  describe("cartesian", () => {
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
    const defaultDataset = createMockDataset({
      data: {
        cols: [metricColumn, timeDimensionColumn, categoryDimensionColumn],
      },
    });

    const dateField = createMockDatetimeField({ id: 4 });
    const sameCategoryDimensionField = createMockCategoryField({
      id: categoryDimensionColumn.id,
    });

    it("should return true if a data source has a matching time dimension", () => {
      const settings = {
        "graph.metrics": [metricColumn.name],
        "graph.dimensions": [timeDimensionColumn.name],
      };
      expect(
        getIsCompatible({
          currentDataset: {
            display: "line",
            columns: [metricColumn, timeDimensionColumn],
            settings,
            computedSettings: settings,
          },
          targetDataset: { fields: [dateField] },
          datasets: {
            "1": defaultDataset,
            "2": createMockDataset({
              data: {
                cols: [
                  createMockDatetimeColumn({ id: dateField.id as number }),
                ],
              },
            }),
          },
        }),
      ).toBe(true);
    });

    it("should return true if a data source has a matching time dimension with a different semantic type (viz-638)", () => {
      const temporalDimensionColumn = createMockDatetimeColumn({
        semantic_type: "type/Temporal",
      });
      const dataset = createMockDataset({
        data: { cols: [metricColumn, temporalDimensionColumn] },
      });
      const settings = {
        "graph.metrics": [metricColumn.name],
        "graph.dimensions": [temporalDimensionColumn.name],
      };

      expect(
        getIsCompatible({
          currentDataset: {
            display: "line",
            columns: [metricColumn, temporalDimensionColumn],
            settings,
            computedSettings: settings,
          },
          targetDataset: { fields: [dateField] },
          datasets: {
            "1": dataset,
            "2": createMockDataset({
              data: {
                cols: [
                  createMockDatetimeColumn({ id: dateField.id as number }),
                ],
              },
            }),
          },
        }),
      ).toBe(true);
    });

    it("should return true if a data source has a matching category dimension", () => {
      const settings = {
        "graph.metrics": [metricColumn.name],
        "graph.dimensions": [categoryDimensionColumn.name],
      };
      expect(
        getIsCompatible({
          currentDataset: {
            display: "line",
            columns: [metricColumn, categoryDimensionColumn],
            settings,
            computedSettings: settings,
          },
          targetDataset: { fields: [sameCategoryDimensionField] },
          datasets: {
            "1": defaultDataset,
            "2": createMockDataset({
              data: {
                cols: [
                  createMockCategoryColumn({
                    id: sameCategoryDimensionField.id as number,
                  }),
                ],
              },
            }),
          },
        }),
      ).toBe(true);
    });
  });
});

function createMockNumericField(opts?: Partial<Field>) {
  return createMockField({
    base_type: "type/Integer",
    effective_type: "type/Integer",
    semantic_type: null,
    ...opts,
  });
}

function createMockCategoryField(opts?: Partial<Field>) {
  return createMockField({
    base_type: "type/Text",
    effective_type: "type/Text",
    semantic_type: "type/Category",
    ...opts,
  });
}

function createMockDatetimeField(opts?: Partial<Field>) {
  return createMockField({
    base_type: "type/DateTime",
    effective_type: "type/DateTime",
    semantic_type: null,
    ...opts,
  });
}
