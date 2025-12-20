import { NULL_DISPLAY_VALUE } from "metabase/lib/constants";

import { getAggregatedRows, getKeyFromDimensionValue } from "./pie";

describe("getKeyFromDimensionValue", () => {
  it("should return NULL_DISPLAY_VALUE for null", () => {
    expect(getKeyFromDimensionValue(null)).toBe(NULL_DISPLAY_VALUE);
  });

  it("should return NULL_DISPLAY_VALUE for undefined", () => {
    expect(getKeyFromDimensionValue(undefined)).toBe(NULL_DISPLAY_VALUE);
  });

  it("should return string representation for strings", () => {
    expect(getKeyFromDimensionValue("test")).toBe("test");
  });

  it("should return string representation for numbers", () => {
    expect(getKeyFromDimensionValue(123)).toBe("123");
  });

  it("should return JSON string for objects (metabase#52686)", () => {
    const obj = { nestedKey1: "nestedValue2" };
    expect(getKeyFromDimensionValue(obj)).toBe(
      '{"nestedKey1":"nestedValue2"}',
    );
  });

  it("should return different keys for different objects (metabase#52686)", () => {
    const obj1 = { nestedKey1: "nestedValue2" };
    const obj2 = { nestedKey1: "nestedValue7", nestedKey2: "nestedValue8" };
    const obj3 = { nestedKey1: "nestedValue13" };

    const key1 = getKeyFromDimensionValue(obj1);
    const key2 = getKeyFromDimensionValue(obj2);
    const key3 = getKeyFromDimensionValue(obj3);

    expect(key1).toBe('{"nestedKey1":"nestedValue2"}');
    expect(key2).toBe('{"nestedKey1":"nestedValue7","nestedKey2":"nestedValue8"}');
    expect(key3).toBe('{"nestedKey1":"nestedValue13"}');

    // All keys should be unique
    expect(new Set([key1, key2, key3]).size).toBe(3);
  });

  it("should return JSON string for arrays", () => {
    expect(getKeyFromDimensionValue([1, 2, 3])).toBe("[1,2,3]");
  });
});

describe("getAggregatedRows", () => {
  it("should aggregate rows by dimension value", () => {
    const rows = [
      ["A", 10],
      ["B", 20],
      ["A", 15],
    ];
    const result = getAggregatedRows(rows, 0, 1);

    expect(result).toEqual([
      ["A", 25],
      ["B", 20],
    ]);
  });

  it("should handle null dimension values", () => {
    const rows = [
      [null, 10],
      ["A", 20],
      [null, 15],
    ];
    const result = getAggregatedRows(rows, 0, 1);

    expect(result).toEqual([
      [null, 25],
      ["A", 20],
    ]);
  });

  it("should aggregate rows with object dimension values correctly (metabase#52686)", () => {
    const obj1 = { nestedKey1: "nestedValue2" };
    const obj2 = { nestedKey1: "nestedValue7", nestedKey2: "nestedValue8" };
    const obj3 = { nestedKey1: "nestedValue13" };
    const obj1Duplicate = { nestedKey1: "nestedValue2" };

    const rows = [
      [obj1, 1],
      [obj2, 1],
      [obj3, 1],
      [obj1Duplicate, 2], // Should aggregate with obj1 since they're equivalent
      [null, 2],
    ];

    const result = getAggregatedRows(rows, 0, 1);

    // Should have 4 unique dimension values (3 different objects + 1 null)
    expect(result.length).toBe(4);

    // Check that obj1 and obj1Duplicate were aggregated together
    const obj1Row = result.find(
      (row) =>
        JSON.stringify(row[0]) === JSON.stringify(obj1),
    );
    expect(obj1Row?.[1]).toBe(3); // 1 + 2

    // Check other rows
    const obj2Row = result.find(
      (row) =>
        JSON.stringify(row[0]) === JSON.stringify(obj2),
    );
    expect(obj2Row?.[1]).toBe(1);

    const obj3Row = result.find(
      (row) =>
        JSON.stringify(row[0]) === JSON.stringify(obj3),
    );
    expect(obj3Row?.[1]).toBe(1);

    const nullRow = result.find((row) => row[0] === null);
    expect(nullRow?.[1]).toBe(2);
  });
});
