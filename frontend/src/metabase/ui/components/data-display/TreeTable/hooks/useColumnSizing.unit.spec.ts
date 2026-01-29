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

  it("returns true when width is auto", () => {
    expect(needsMeasurement(createColumn({ width: "auto" }))).toBe(true);
  });

  it("returns false when minWidth is a number or undefined", () => {
    expect(needsMeasurement(createColumn({ minWidth: 100 }))).toBe(false);
    expect(needsMeasurement(createColumn({}))).toBe(false);
  });

  it("returns false when width is a number", () => {
    expect(needsMeasurement(createColumn({ width: 100 }))).toBe(false);
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

  it("includes widthPadding when minWidth is auto", () => {
    const column = createColumn({
      id: "name",
      minWidth: "auto",
      widthPadding: 16,
    });
    expect(getMinConstraint(column, 1, { name: 200 }, 0, 20)).toBe(216);
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

  it("uses content width for width=auto columns without stretching", () => {
    const columns = [
      createColumn({ id: "auto", width: "auto" }),
      createColumn({ id: "stretch" }),
    ];
    // auto column uses measured width (150), stretch gets remaining space
    expect(calculateColumnWidths(columns, 500, { auto: 150 }, 0, 20)).toEqual({
      auto: 150,
      stretch: 350,
    });
  });

  it("falls back to MIN_COLUMN_WIDTH when width=auto has no measured content", () => {
    const columns = [
      createColumn({ id: "auto", width: "auto" }),
      createColumn({ id: "stretch" }),
    ];
    expect(calculateColumnWidths(columns, 500, {}, 0, 20)).toEqual({
      auto: MIN_COLUMN_WIDTH,
      stretch: 450,
    });
  });

  it("adds widthPadding to width=auto columns", () => {
    const columns = [
      createColumn({ id: "auto", width: "auto", widthPadding: 20 }),
      createColumn({ id: "stretch" }),
    ];
    expect(calculateColumnWidths(columns, 500, { auto: 150 }, 0, 20)).toEqual({
      auto: 170,
      stretch: 330,
    });
  });

  it("adds widthPadding to minWidth=auto columns", () => {
    const columns = [
      createColumn({ id: "auto", minWidth: "auto", widthPadding: 20 }),
    ];
    expect(calculateColumnWidths(columns, 200, { auto: 150 }, 0, 20)).toEqual({
      auto: 200,
    });
  });

  it("maxAutoWidth caps measured content width", () => {
    const columns = [
      createColumn({ id: "auto", width: "auto", maxAutoWidth: 100 }),
      createColumn({ id: "stretch" }),
    ];
    // Content is 300 but maxAutoWidth caps it at 100
    expect(calculateColumnWidths(columns, 500, { auto: 300 }, 0, 20)).toEqual({
      auto: 100,
      stretch: 400,
    });
    // Content smaller than cap uses actual content width
    expect(calculateColumnWidths(columns, 500, { auto: 80 }, 0, 20)).toEqual({
      auto: 80,
      stretch: 420,
    });
  });

  it("maxAutoWidth caps minimum but column can stretch beyond it if there is extra space", () => {
    const columns = [
      createColumn({ id: "col", minWidth: "auto", maxAutoWidth: 100 }),
      createColumn({ id: "fixed", width: 100 }),
    ];
    // Content is 300, maxAutoWidth caps minimum at 100, but column stretches to 400
    expect(calculateColumnWidths(columns, 500, { col: 300 }, 0, 20)).toEqual({
      col: 400,
      fixed: 100,
    });
  });
});
