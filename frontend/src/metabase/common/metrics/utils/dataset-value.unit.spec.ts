import {
  createMockColumn,
  createMockDataset,
  createMockDatasetData,
} from "metabase-types/api/mocks";

import { getDatasetValueForMetric, isDatasetScalar } from "./dataset-value";

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
