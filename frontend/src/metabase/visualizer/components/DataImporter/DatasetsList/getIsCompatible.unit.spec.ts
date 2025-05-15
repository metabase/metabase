import registerVisualizations from "metabase/visualizations/register";
import { createDataSource } from "metabase/visualizer/utils";
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
  const dataSource = createDataSource("card", `entity_1`, "Card 1");

  it("should return false if a target data source doesn't have columns", () => {
    const result = getIsCompatible({
      currentDataset: {
        display: "bar",
        columns: [createMockNumericColumn(), createMockCategoryColumn()],
        settings: {},
      },
      targetDataset: { fields: [], dataSource },
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
          },
          targetDataset: {
            dataSource,
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
    it("should return true if a data source has one numeric column", () => {
      expect(
        getIsCompatible({
          currentDataset: {
            display: "funnel",
            columns: [],
            settings: {},
          },
          targetDataset: { dataSource, fields: [createMockNumericField()] },
          datasets: {
            "1": createMockDataset({ data: { cols: [] } }),
            "2": createMockDataset({
              data: { cols: [createMockNumericColumn()] },
            }),
          },
        }),
      ).toBe(true);
    });

    it("should return false if a data source has more than one numeric columns", () => {
      expect(
        getIsCompatible({
          currentDataset: {
            display: "funnel",
            columns: [],
            settings: {},
          },
          targetDataset: {
            dataSource,
            fields: [
              createMockNumericField({ id: 1 }),
              createMockNumericField({ id: 2 }),
            ],
          },
          datasets: {
            "1": createMockDataset({ data: { cols: [] } }),
            "2": createMockDataset({
              data: {
                cols: [
                  createMockNumericColumn({ id: 1 }),
                  createMockNumericColumn({ id: 2 }),
                ],
              },
            }),
          },
        }),
      ).toBe(false);
    });

    it("should return false if a data source has one non-numeric column", () => {
      expect(
        getIsCompatible({
          currentDataset: {
            display: "funnel",
            columns: [],
            settings: {},
          },
          targetDataset: { dataSource, fields: [createMockCategoryField()] },
          datasets: {
            "1": createMockDataset({ data: { cols: [] } }),
            "2": createMockDataset({
              data: { cols: [createMockCategoryColumn()] },
            }),
          },
        }),
      ).toBe(false);
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
    const otherCategoryDimensionField = createMockCategoryField({ id: 5 });

    it("should return false if current chart doesn't have dimensions", () => {
      expect(
        getIsCompatible({
          currentDataset: {
            display: "line",
            columns: [metricColumn],
            settings: { "graph.metricColumn": [metricColumn.id] },
          },
          targetDataset: {
            dataSource,
            fields: [dateField, sameCategoryDimensionField],
          },
          datasets: {
            "1": defaultDataset,
          },
        }),
      ).toBe(false);
    });

    it("should return true if a data source has a matching time dimension", () => {
      expect(
        getIsCompatible({
          currentDataset: {
            display: "line",
            columns: [metricColumn, timeDimensionColumn],
            settings: {
              "graph.metricColumn": [metricColumn.id],
              "graph.timeColumn": [timeDimensionColumn.id],
            },
          },
          targetDataset: { dataSource, fields: [dateField] },
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

      expect(
        getIsCompatible({
          currentDataset: {
            display: "line",
            columns: [metricColumn, temporalDimensionColumn],
            settings: {
              "graph.metricColumn": [metricColumn.id],
              "graph.timeColumn": [temporalDimensionColumn.id],
            },
          },
          targetDataset: { dataSource, fields: [dateField] },
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

    it("should return false if a data source doesn't have a matching time dimension", () => {
      expect(
        getIsCompatible({
          currentDataset: {
            display: "line",
            columns: [metricColumn, timeDimensionColumn],
            settings: {
              "graph.metricColumn": [metricColumn.id],
              "graph.timeColumn": [timeDimensionColumn.id],
            },
          },
          targetDataset: { dataSource, fields: [sameCategoryDimensionField] },
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
      ).toBe(false);
    });

    it("should return true if a data source has a matching category dimension", () => {
      expect(
        getIsCompatible({
          currentDataset: {
            display: "line",
            columns: [metricColumn, categoryDimensionColumn],
            settings: {
              "graph.metricColumn": [metricColumn.id],
              "graph.timeColumn": [categoryDimensionColumn.id],
            },
          },
          targetDataset: { dataSource, fields: [sameCategoryDimensionField] },
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

    it("should return false if a data source doesn't have a matching category dimension", () => {
      expect(
        getIsCompatible({
          currentDataset: {
            display: "line",
            columns: [metricColumn, categoryDimensionColumn],
            settings: {
              "graph.metricColumn": [metricColumn.id],
              "graph.timeColumn": [categoryDimensionColumn.id],
            },
          },
          targetDataset: { dataSource, fields: [otherCategoryDimensionField] },
          datasets: {
            "1": defaultDataset,
            "2": createMockDataset({
              data: {
                cols: [
                  createMockCategoryColumn({
                    id: otherCategoryDimensionField.id as number,
                  }),
                ],
              },
            }),
          },
        }),
      ).toBe(false);
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
