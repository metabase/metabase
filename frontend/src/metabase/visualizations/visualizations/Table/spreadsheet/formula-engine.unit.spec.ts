import {
  type FormulaEvalContext,
  evaluateFormula,
  getReferencedColumns,
  parseFormula,
} from "./formula-engine";

// A tiny in-memory grid: rows are arrays of numbers, columns are indexed
// 0 (A), 1 (B), 2 (C), ...
function makeContext(
  grid: (number | null)[][],
  columnNames: string[] = [],
): FormulaEvalContext {
  return {
    getCellValue: (row, col) => grid[row]?.[col] ?? null,
    rowCount: grid.length,
    getColumnIndex: (name) => {
      const index = columnNames.findIndex(
        (candidate) => candidate.toLowerCase() === name.trim().toLowerCase(),
      );
      return index === -1 ? null : index;
    },
  };
}

describe("formula-engine", () => {
  it("evaluates simple arithmetic", () => {
    const ast = parseFormula("1 + 2 * 3");
    expect(evaluateFormula(ast, 0, makeContext([]))).toBe(7);
  });

  it("respects parentheses and exponents", () => {
    expect(
      evaluateFormula(parseFormula("(1 + 2) ^ 2"), 0, makeContext([])),
    ).toBe(9);
  });

  it("evaluates cell references relative to the target row", () => {
    const grid = [
      [10, 2],
      [20, 4],
      [30, 5],
    ];
    const ast = parseFormula("A1/B1");
    expect(evaluateFormula(ast, 0, makeContext(grid))).toBe(5);
    expect(evaluateFormula(ast, 1, makeContext(grid))).toBe(5);
    expect(evaluateFormula(ast, 2, makeContext(grid))).toBe(6);
  });

  it("fills down correctly when a formula is typed into a row other than the first (anchorRow)", () => {
    // Typing "=A5+A6" while sitting in row index 4 (row 5) should behave
    // like dragging that Excel formula down/up: row index 5 (row 6)
    // becomes A6+A7, row index 0 (row 1) becomes A1+A2.
    const grid = [[1], [2], [3], [4], [5], [6], [7]];
    const ast = parseFormula("A5+A6");
    const anchorRow = 4;
    expect(evaluateFormula(ast, 4, makeContext(grid), anchorRow)).toBe(5 + 6);
    expect(evaluateFormula(ast, 5, makeContext(grid), anchorRow)).toBe(6 + 7);
    expect(evaluateFormula(ast, 0, makeContext(grid), anchorRow)).toBe(1 + 2);
  });

  it("ignores anchorRow for absolute ($) row references", () => {
    const grid = [[100], [5], [10]];
    const ast = parseFormula("A2/A$1");
    expect(evaluateFormula(ast, 1, makeContext(grid), 1)).toBeCloseTo(0.05);
  });

  it("keeps absolute ($) row references fixed across rows", () => {
    const grid = [[100], [5], [10]];
    const ast = parseFormula("A2/A$1");
    // row 2 (index 1) divided by fixed row 1 (index 0)
    expect(evaluateFormula(ast, 0, makeContext(grid))).toBeCloseTo(0.05);
    // filled down to target row 1: A3 / A$1
    expect(evaluateFormula(ast, 1, makeContext(grid))).toBeCloseTo(0.1);
  });

  it("evaluates SUM/AVERAGE/MIN/MAX over a range", () => {
    const grid = [[1], [2], [3], [4]];
    expect(
      evaluateFormula(parseFormula("SUM(A1:A4)"), 0, makeContext(grid)),
    ).toBe(10);
    expect(
      evaluateFormula(parseFormula("AVERAGE(A1:A4)"), 0, makeContext(grid)),
    ).toBe(2.5);
    expect(
      evaluateFormula(parseFormula("MIN(A1:A4)"), 0, makeContext(grid)),
    ).toBe(1);
    expect(
      evaluateFormula(parseFormula("MAX(A1:A4)"), 0, makeContext(grid)),
    ).toBe(4);
    expect(
      evaluateFormula(parseFormula("COUNT(A1:A4)"), 0, makeContext(grid)),
    ).toBe(4);
  });

  it("supports ROUND and ABS", () => {
    expect(
      evaluateFormula(parseFormula("ROUND(1.2345, 2)"), 0, makeContext([])),
    ).toBe(1.23);
    expect(evaluateFormula(parseFormula("ABS(-5)"), 0, makeContext([]))).toBe(
      5,
    );
  });

  it("throws #DIV/0! on division by zero", () => {
    const grid = [[10, 0]];
    expect(() =>
      evaluateFormula(parseFormula("A1/B1"), 0, makeContext(grid)),
    ).toThrow("#DIV/0!");
  });

  it("throws on unknown functions and malformed formulas", () => {
    expect(() => parseFormula("")).toThrow();
    expect(() => parseFormula("A1 +")).toThrow();
    expect(() =>
      evaluateFormula(parseFormula("NOPE(A1)"), 0, makeContext([[1]])),
    ).toThrow("#NAME?");
  });

  it("collects referenced columns for dependency tracking", () => {
    const ast = parseFormula("A1 + SUM(B1:C4) * D1");
    expect(getReferencedColumns(ast).sort()).toEqual([0, 1, 2, 3]);
  });
});

describe("whole-column references", () => {
  const grid = [
    [1, 10],
    [2, 20],
    [3, 30],
  ];

  it("sums every loaded row, with or without the range form", () => {
    const ctx = makeContext(grid);
    expect(evaluateFormula(parseFormula("SUM(A)"), 0, ctx)).toBe(6);
    expect(evaluateFormula(parseFormula("SUM(A:A)"), 0, ctx)).toBe(6);
  });

  it("does not shift as the formula fills down", () => {
    const ctx = makeContext(grid);
    expect(evaluateFormula(parseFormula("SUM(A)"), 0, ctx)).toBe(
      evaluateFormula(parseFormula("SUM(A)"), 2, ctx),
    );
  });

  it("spans several columns when written A:B", () => {
    expect(
      evaluateFormula(parseFormula("SUM(A:B)"), 0, makeContext(grid)),
    ).toBe(66);
  });

  it("resolves a column referenced by name", () => {
    const ctx = makeContext(grid, ["ID", "Subtotal"]);
    expect(evaluateFormula(parseFormula("SUM([Subtotal])"), 0, ctx)).toBe(60);
  });

  it("names the column when it cannot be resolved", () => {
    const ctx = makeContext(grid, ["ID"]);
    expect(() => evaluateFormula(parseFormula("SUM([Nope])"), 0, ctx)).toThrow(
      /Nope/,
    );
  });

  it("keeps now and today as functions rather than columns", () => {
    expect(parseFormula("now")).toMatchObject({ type: "call", name: "NOW" });
    expect(parseFormula("today")).toMatchObject({
      type: "call",
      name: "TODAY",
    });
  });
});
