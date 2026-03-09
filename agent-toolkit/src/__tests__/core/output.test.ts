import { describe, it, expect } from "vitest";
import {
  applyFieldMask,
  applyFieldMaskToArray,
  truncateRows,
  formatOutput,
} from "../../core/output.js";

describe("applyFieldMask", () => {
  it("filters to specified fields", () => {
    const data = { id: 1, name: "test", secret: "hidden" };
    expect(applyFieldMask(data, ["id", "name"])).toEqual({
      id: 1,
      name: "test",
    });
  });

  it("ignores non-existent fields", () => {
    const data = { id: 1 };
    expect(applyFieldMask(data, ["id", "missing"])).toEqual({ id: 1 });
  });
});

describe("applyFieldMaskToArray", () => {
  it("masks each item", () => {
    const data = [
      { id: 1, name: "a", extra: true },
      { id: 2, name: "b", extra: false },
    ];
    expect(applyFieldMaskToArray(data, ["id", "name"])).toEqual([
      { id: 1, name: "a" },
      { id: 2, name: "b" },
    ]);
  });
});

describe("truncateRows", () => {
  it("passes through when under limit", () => {
    const rows = [[1], [2], [3]];
    const result = truncateRows(rows, 10);
    expect(result.rows).toEqual(rows);
    expect(result.meta.truncated).toBe(false);
    expect(result.meta.total_count).toBe(3);
    expect(result.meta.returned_count).toBe(3);
  });

  it("truncates when over limit", () => {
    const rows = [[1], [2], [3], [4], [5]];
    const result = truncateRows(rows, 3);
    expect(result.rows).toEqual([[1], [2], [3]]);
    expect(result.meta.truncated).toBe(true);
    expect(result.meta.total_count).toBe(5);
    expect(result.meta.returned_count).toBe(3);
  });
});

describe("formatOutput", () => {
  it("outputs JSON", () => {
    expect(formatOutput({ id: 1 })).toBe('{\n  "id": 1\n}');
  });

  it("applies field mask when opts provided", () => {
    const result = formatOutput(
      { id: 1, name: "test", secret: "x" },
      { fields: ["id", "name"] },
    );
    const parsed = JSON.parse(result);
    expect(parsed).toEqual({ id: 1, name: "test" });
  });

  it("applies field mask to arrays", () => {
    const result = formatOutput(
      [{ id: 1, extra: true }, { id: 2, extra: false }],
      { fields: ["id"] },
    );
    const parsed = JSON.parse(result);
    expect(parsed).toEqual([{ id: 1 }, { id: 2 }]);
  });
});
