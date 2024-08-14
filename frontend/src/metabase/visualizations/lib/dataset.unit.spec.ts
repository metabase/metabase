import {
  createMockColumn,
  createMockDatasetData,
} from "metabase-types/api/mocks";

import { sumMetric, groupDatasetMetrics } from "./dataset";

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

describe("groupDatasetMetrics", () => {
  const cols = [
    createMockColumn({
      name: "value1",
      base_type: "type/Integer",
    }),
    createMockColumn({
      name: "value2",
      base_type: "type/Integer",
    }),
    createMockColumn({
      name: "category1",
    }),
    createMockColumn({
      name: "category2",
    }),
  ];
  const data = createMockDatasetData({
    cols,
    rows: [
      [10, 100, "javascript", "foo"],
      [20, 200, "javascript", "bar"],
      [30, 300, "php", "bar"],
      [40, 400, "php", "bar"],
      [50, 500, "clojure", "baz"],
    ],
  });

  it("should group metric columns by provided single dimension", () => {
    const result = groupDatasetMetrics(data, "category1");
    expect(result).toStrictEqual({
      ...data,
      rows: [
        [30, 300, "javascript", "foo"],
        [70, 700, "php", "bar"],
        [50, 500, "clojure", "baz"],
      ],
    });
  });

  it("should group metric columns by provided N dimensions", () => {
    const result = groupDatasetMetrics(data, ["category1", "category2"]);
    expect(result).toStrictEqual({
      ...data,
      rows: [
        [10, 100, "javascript", "foo"],
        [20, 200, "javascript", "bar"],
        [70, 700, "php", "bar"],
        [50, 500, "clojure", "baz"],
      ],
    });
  });
});
