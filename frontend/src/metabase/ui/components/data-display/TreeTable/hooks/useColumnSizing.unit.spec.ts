import { MIN_COLUMN_WIDTH } from "../constants";
import type { TreeTableColumnDef } from "../types";

import {
  calculateColumnWidths,
  getMinConstraint,
  needsMeasurement,
} from "./useColumnSizing";

type TestNode = { id: string; name: string };

const createColumn = (
  overrides: Partial<TreeTableColumnDef<TestNode>> = {},
): TreeTableColumnDef<TestNode> => ({
  id: "test",
  ...overrides,
});

describe("needsMeasurement", () => {
  it("returns true when minWidth is auto", () => {
    expect(needsMeasurement(createColumn({ minWidth: "auto" }))).toBe(true);
  });

  it("returns false when minWidth is a number or undefined", () => {
    expect(needsMeasurement(createColumn({ minWidth: 100 }))).toBe(false);
    expect(needsMeasurement(createColumn({}))).toBe(false);
  });
});

describe("getMinConstraint", () => {
  it("uses content width when minWidth is auto", () => {
    const column = createColumn({ id: "name", minWidth: "auto" });
    expect(getMinConstraint(column, 1, { name: 200 }, 0, 20)).toBe(200);
  });

  it("falls back to MIN_COLUMN_WIDTH when content width is missing", () => {
    const column = createColumn({ id: "name", minWidth: "auto" });
    expect(getMinConstraint(column, 1, {}, 0, 20)).toBe(MIN_COLUMN_WIDTH);
  });

  it("adds indent padding for first column based on maxDepth", () => {
    const column = createColumn({ id: "name", minWidth: 100 });
    // maxDepth=3, indentWidth=20 -> MIN_COLUMN_WIDTH + 60 = 110
    expect(getMinConstraint(column, 0, {}, 3, 20)).toBe(MIN_COLUMN_WIDTH + 60);
  });
});

describe("calculateColumnWidths", () => {
  it("returns empty object when containerWidth is 0", () => {
    const columns = [createColumn({ id: "name" })];
    expect(calculateColumnWidths(columns, 0, {}, 0, 20)).toEqual({});
  });

  it("uses fixed width for columns with explicit width", () => {
    const columns = [
      createColumn({ id: "name", width: 200 }),
      createColumn({ id: "date", width: 100 }),
    ];
    expect(calculateColumnWidths(columns, 500, {}, 0, 20)).toEqual({
      name: 200,
      date: 100,
    });
  });

  it("distributes remaining space evenly among stretching columns", () => {
    const columns = [
      createColumn({ id: "fixed", width: 100 }),
      createColumn({ id: "stretch1" }),
      createColumn({ id: "stretch2" }),
    ];
    // 500 - 100 = 400 remaining, split evenly = 200 each
    expect(calculateColumnWidths(columns, 500, {}, 0, 20)).toEqual({
      fixed: 100,
      stretch1: 200,
      stretch2: 200,
    });
  });

  it("respects min and max width constraints", () => {
    const columns = [
      createColumn({ id: "col1", minWidth: 300 }),
      createColumn({ id: "col2", maxWidth: 50 }),
    ];
    // col1 gets 300 (min), col2 gets 50 (max), remaining 50 goes to col1
    expect(calculateColumnWidths(columns, 400, {}, 0, 20)).toEqual({
      col1: 300,
      col2: 50,
    });
  });
});
