import {
  createMockCollection,
  createMockColumn,
  createMockDataset,
  createMockDatasetData,
} from "metabase-types/api/mocks";
import { SortDirection } from "metabase-types/api/sorting";

import { createMockMetricResult } from "../test-utils";

import type { MetricResult } from "./types";
import {
  getDatasetValueForMetric,
  isDatasetScalar,
  sortMetrics,
} from "./utils";

describe("sortMetrics", () => {
  let id = 0;
  const metricMap: Record<string, MetricResult> = {
    "model named A, with collection path X / Y / Z": createMockMetricResult({
      id: id++,
      name: "A",
      collection: createMockCollection({
        name: "Z",
        effective_ancestors: [
          createMockCollection({ name: "X" }),
          createMockCollection({ name: "Y" }),
        ],
      }),
    }),
    "model named C, with collection path Y": createMockMetricResult({
      id: id++,
      name: "C",
      collection: createMockCollection({ name: "Y" }),
    }),
    "model named B, with collection path D / E / F": createMockMetricResult({
      id: id++,
      name: "B",
      collection: createMockCollection({
        name: "F",
        effective_ancestors: [
          createMockCollection({ name: "D" }),
          createMockCollection({ name: "E" }),
        ],
      }),
    }),
  };
  const mockSearchResults = Object.values(metricMap);

  it("can sort by name in ascending order", () => {
    const sortingOptions = {
      sort_column: "name",
      sort_direction: SortDirection.Asc,
    } as const;
    const sorted = sortMetrics(mockSearchResults, sortingOptions);
    expect(sorted?.map(model => model.name)).toEqual(["A", "B", "C"]);
  });

  it("can sort by name in descending order", () => {
    const sortingOptions = {
      sort_column: "name",
      sort_direction: SortDirection.Desc,
    } as const;
    const sorted = sortMetrics(mockSearchResults, sortingOptions);
    expect(sorted?.map(model => model.name)).toEqual(["C", "B", "A"]);
  });

  it("can sort by collection path in ascending order", () => {
    const sortingOptions = {
      sort_column: "collection",
      sort_direction: SortDirection.Asc,
    } as const;
    const sorted = sortMetrics(mockSearchResults, sortingOptions);
    expect(sorted?.map(model => model.name)).toEqual(["B", "A", "C"]);
  });

  it("can sort by collection path in descending order", () => {
    const sortingOptions = {
      sort_column: "collection",
      sort_direction: SortDirection.Desc,
    } as const;
    const sorted = sortMetrics(mockSearchResults, sortingOptions);
    expect(sorted?.map(model => model.name)).toEqual(["C", "A", "B"]);
  });

  describe("secondary sort", () => {
    metricMap["model named C, with collection path Z"] = createMockMetricResult(
      {
        name: "C",
        collection: createMockCollection({ name: "Z" }),
      },
    );
    metricMap["model named Bz, with collection path D / E / F"] =
      createMockMetricResult({
        name: "Bz",
        collection: createMockCollection({
          name: "F",
          effective_ancestors: [
            createMockCollection({ name: "D" }),
            createMockCollection({ name: "E" }),
          ],
        }),
      });
    const mockSearchResults = Object.values(metricMap);

    it("can sort by collection path, ascending, and then does a secondary sort by name", () => {
      const sortingOptions = {
        sort_column: "collection",
        sort_direction: SortDirection.Asc,
      } as const;
      const sorted = sortMetrics(mockSearchResults, sortingOptions);
      expect(sorted).toEqual([
        metricMap["model named B, with collection path D / E / F"],
        metricMap["model named Bz, with collection path D / E / F"],
        metricMap["model named A, with collection path X / Y / Z"],
        metricMap["model named C, with collection path Y"],
        metricMap["model named C, with collection path Z"],
      ]);
    });

    it("can sort by collection path, descending, and then does a secondary sort by name", () => {
      const sortingOptions = {
        sort_column: "collection",
        sort_direction: SortDirection.Desc,
      } as const;
      const sorted = sortMetrics(mockSearchResults, sortingOptions);
      expect(sorted).toEqual([
        metricMap["model named C, with collection path Z"],
        metricMap["model named C, with collection path Y"],
        metricMap["model named A, with collection path X / Y / Z"],
        metricMap["model named Bz, with collection path D / E / F"],
        metricMap["model named B, with collection path D / E / F"],
      ]);
    });

    it("can sort by collection path, ascending, and then does a secondary sort by name - with a localized sort order", () => {
      const sortingOptions = {
        sort_column: "collection",
        sort_direction: SortDirection.Asc,
      } as const;

      const addUmlauts = (model: MetricResult): MetricResult => ({
        ...model,
        name: model.name.replace(/^B$/g, "Bä"),
        collection: {
          ...model.collection,
          effective_ancestors: model.collection?.effective_ancestors?.map(
            ancestor => ({
              ...ancestor,
              name: ancestor.name.replace("X", "Ä"),
            }),
          ),
        },
      });

      const swedishmetricMap = {
        "model named A, with collection path Ä / Y / Z": addUmlauts(
          metricMap["model named A, with collection path X / Y / Z"],
        ),
        "model named Bä, with collection path D / E / F": addUmlauts(
          metricMap["model named B, with collection path D / E / F"],
        ),
        "model named Bz, with collection path D / E / F": addUmlauts(
          metricMap["model named Bz, with collection path D / E / F"],
        ),
        "model named C, with collection path Y": addUmlauts(
          metricMap["model named C, with collection path Y"],
        ),
        "model named C, with collection path Z": addUmlauts(
          metricMap["model named C, with collection path Z"],
        ),
      };

      const swedishResults = Object.values(swedishmetricMap);

      // When sorting in Swedish, z comes before ä
      const swedishLocaleCode = "sv";
      const sorted = sortMetrics(
        swedishResults,
        sortingOptions,
        swedishLocaleCode,
      );
      expect("ä".localeCompare("z", "sv", { sensitivity: "base" })).toEqual(1);
      expect(sorted).toEqual([
        swedishmetricMap["model named Bz, with collection path D / E / F"], // Model Bz sorts before Bä
        swedishmetricMap["model named Bä, with collection path D / E / F"],
        swedishmetricMap["model named C, with collection path Y"],
        swedishmetricMap["model named C, with collection path Z"], // Collection Z sorts before Ä
        swedishmetricMap["model named A, with collection path Ä / Y / Z"],
      ]);
    });
  });
});

describe("isDatasetScalar", () => {
  it("should return true for a dataset with a single column and a single row", () => {
    const dataset = createMockDataset({
      data: createMockDatasetData({
        cols: [createMockColumn({ name: "col1" })],
        rows: [[1]],
      }),
    });

    expect(isDatasetScalar(dataset)).toBe(true);
  });

  it("should return false for a dataset with more than one column", () => {
    const dataset = createMockDataset({
      data: createMockDatasetData({
        cols: [
          createMockColumn({ name: "col1" }),
          createMockColumn({ name: "col2" }),
        ],
        rows: [[1, 2]],
      }),
    });

    expect(isDatasetScalar(dataset)).toBe(false);
  });

  it("should return false for a dataset with more than one row", () => {
    const dataset = createMockDataset({
      data: createMockDatasetData({
        cols: [createMockColumn({ name: "col1" })],
        rows: [[1], [2]],
      }),
    });

    expect(isDatasetScalar(dataset)).toBe(false);
  });

  it("should return false for a dataset with errors", () => {
    const dataset = createMockDataset({
      error: "error",
      data: createMockDatasetData({
        cols: [createMockColumn({ name: "col1" })],
        rows: [[1]],
      }),
    });

    expect(isDatasetScalar(dataset)).toBe(false);
  });
});

describe("getDatasetValueForMetric", () => {
  describe("scalar metric", () => {
    it("should return null if the dataset is not scalar", () => {
      const dataset = createMockDataset({
        data: createMockDatasetData({
          cols: [createMockColumn({ name: "col1" })],
          rows: [[1], [2]],
        }),
      });
      expect(getDatasetValueForMetric(dataset)).toBe(null);
    });

    it("should return null for a scalar dataset with errors", () => {
      const dataset = createMockDataset({
        error: "error",
        data: createMockDatasetData({
          cols: [createMockColumn({ name: "col1" })],
          rows: [[1]],
        }),
      });

      expect(getDatasetValueForMetric(dataset)).toBe(null);
    });

    it("should return the value if the dataset is scalar", () => {
      const value = 42;
      const column = createMockColumn({ name: "col1" });
      const dataset = createMockDataset({
        data: createMockDatasetData({
          cols: [column],
          rows: [[value]],
        }),
      });
      expect(getDatasetValueForMetric(dataset)).toEqual({
        value: "42",
        label: "Overall",
      });
    });

    it("should return null for a scalar dataset with no value", () => {
      const dataset = createMockDataset({
        data: createMockDatasetData({
          cols: [createMockColumn({ name: "col2" })],
          rows: [],
        }),
      });

      expect(getDatasetValueForMetric(dataset)).toEqual(null);
    });
  });

  describe("temporal metric", () => {
    it("should return null for a timeseries dataset with errors", () => {
      const dataset = createMockDataset({
        error: "error",
        data: createMockDatasetData({
          cols: [
            createMockColumn({ name: "col1", base_type: "type/DateTime" }),
            createMockColumn({ name: "col2" }),
          ],
          rows: [["2024-01-01T00:00:00.000Z", 1]],
        }),
      });

      expect(getDatasetValueForMetric(dataset)).toBe(null);
    });

    it("should return the last row value a timeseries dataset", () => {
      const dataset = createMockDataset({
        data: createMockDatasetData({
          cols: [
            createMockColumn({ name: "col1", base_type: "type/DateTime" }),
            createMockColumn({ name: "col2" }),
          ],
          rows: [["2024-01-01T00:00:00.000Z", 1]],
        }),
      });

      expect(getDatasetValueForMetric(dataset)).toEqual({
        value: "1",
        label: "January 1, 2024, 12:00 AM",
      });
    });

    it("should return null for a temporal dataset with no value", () => {
      const dataset = createMockDataset({
        data: createMockDatasetData({
          cols: [
            createMockColumn({ name: "col1", base_type: "type/DateTime" }),
            createMockColumn({ name: "col2" }),
          ],
          rows: [],
        }),
      });

      expect(getDatasetValueForMetric(dataset)).toEqual(null);
    });
  });
});
