import { t } from "ttag";

import {
  type ProgressMetrics,
  calculateProgressMetrics,
  extractProgressValue,
  findProgressColumn,
  getGoalValue,
  getProgressColors,
  getProgressMessage,
  getValue,
} from "metabase/visualizations/visualizations/Progress/utils";
import type { DatasetColumn, RowValues } from "metabase-types/api";
import { createMockColumn } from "metabase-types/api/mocks";

const mockColumns: DatasetColumn[] = [
  createMockColumn({
    name: "count",
    display_name: "Count",
    base_type: "type/Integer",
  }),
  createMockColumn({
    name: "total",
    display_name: "Total",
    base_type: "type/Float",
  }),
  createMockColumn({
    name: "name",
    display_name: "Name",
    base_type: "type/Text",
  }),
  createMockColumn({
    name: "average",
    display_name: "Average",
    base_type: "type/Float",
  }),
];

describe("getValue", () => {
  it("should return the first row, first column value", () => {
    const rows: RowValues[] = [
      [42, "test"],
      [100, "other"],
    ];
    expect(getValue(rows)).toBe(42);
  });

  it("should return 0 for non-numeric values", () => {
    const rows: RowValues[] = [["not a number", "test"]];
    expect(getValue(rows)).toBe(0);
  });

  it("should handle Infinity", () => {
    const rows: RowValues[] = [["Infinity", "test"]];
    expect(getValue(rows)).toBe(Infinity);
  });

  it("should return 0 for empty rows", () => {
    const rows: RowValues[] = [];
    expect(getValue(rows)).toBe(0);
  });

  it("should return 0 for null values", () => {
    const rows: RowValues[] = [[null, "test"]];
    expect(getValue(rows)).toBe(0);
  });
});

describe("getGoalValue", () => {
  const rows: RowValues[] = [[10, 100.5, "test", 25.0]];

  it("should return the number when goal is numeric", () => {
    expect(getGoalValue(50, mockColumns, rows)).toBe(50);
    expect(getGoalValue(0, mockColumns, rows)).toBe(0);
    expect(getGoalValue(-10, mockColumns, rows)).toBe(-10);
  });

  it("should return column value when goal is a column name", () => {
    expect(getGoalValue("count", mockColumns, rows)).toBe(10);
    expect(getGoalValue("total", mockColumns, rows)).toBe(100.5);
    expect(getGoalValue("average", mockColumns, rows)).toBe(25.0);
  });

  it("should return 0 for non-existent column names", () => {
    expect(getGoalValue("nonexistent", mockColumns, rows)).toBe(0);
  });

  it("should handle null column values", () => {
    const rowsWithNull: RowValues[] = [[10, null, "test", 25.0]];
    expect(getGoalValue("total", mockColumns, rowsWithNull)).toBe(0);
  });

  it("should handle Infinity in columns", () => {
    const rowsWithInfinity: RowValues[] = [[10, "Infinity", "test", 25.0]];
    expect(getGoalValue("total", mockColumns, rowsWithInfinity)).toBe(Infinity);
  });

  it("should return 0 for invalid goal types", () => {
    expect(getGoalValue(null as any, mockColumns, rows)).toBe(0);
    expect(getGoalValue(undefined as any, mockColumns, rows)).toBe(0);
  });
});

describe("extractProgressValue", () => {
  const rows: RowValues[] = [[10, 100.5, "test", 25.0]];

  it("should extract value from specified column index", () => {
    expect(extractProgressValue(rows, 0)).toBe(10);
    expect(extractProgressValue(rows, 1)).toBe(100.5);
    expect(extractProgressValue(rows, 3)).toBe(25.0);
  });

  it("should handle null values in columns", () => {
    const rowsWithNull: RowValues[] = [[null, 100.5, "test", 25.0]];
    expect(extractProgressValue(rowsWithNull, 0)).toBe(0);
  });

  it("should handle Infinity values", () => {
    const rowsWithInfinity: RowValues[] = [["Infinity", 100.5, "test", 25.0]];
    expect(extractProgressValue(rowsWithInfinity, 0)).toBe(Infinity);
  });

  it("should handle empty rows", () => {
    expect(extractProgressValue([], 0)).toBe(0);
  });

  it("should handle non-numeric values", () => {
    const rowsWithText: RowValues[] = [["not a number", 100.5, "test", 25.0]];
    expect(extractProgressValue(rowsWithText, 0)).toBe(0);
  });
});

describe("findProgressColumn", () => {
  it("should find column by valueField when provided", () => {
    const result = findProgressColumn(mockColumns, "total");
    expect(result).toBe(mockColumns[1]);
  });

  it("should return first numeric column when no valueField", () => {
    const result = findProgressColumn(mockColumns);
    expect(result).toBe(mockColumns[0]); // "count" is first numeric
  });

  it("should fallback to first column when no numeric columns", () => {
    const textOnlyColumns: DatasetColumn[] = [
      createMockColumn({
        name: "name1",
        display_name: "Name 1",
        base_type: "type/Text",
      }),
      createMockColumn({
        name: "name2",
        display_name: "Name 2",
        base_type: "type/Text",
      }),
    ];
    const result = findProgressColumn(textOnlyColumns);
    expect(result).toBe(textOnlyColumns[0]);
  });

  it("should return undefined for non-existent valueField", () => {
    const result = findProgressColumn(mockColumns, "nonexistent");
    expect(result).toBeUndefined();
  });

  it("should handle empty columns array", () => {
    const result = findProgressColumn([]);
    expect(result).toBeUndefined();
  });
});

describe("calculateProgressMetrics", () => {
  it("should calculate metrics for value under goal", () => {
    const result = calculateProgressMetrics(25, 100);
    expect(result).toEqual({
      value: 25,
      goal: 100,
      hasValidValue: true,
      hasValidGoal: true,
      barPercent: 0.25,
      arrowPercent: 0.25,
    });
  });

  it("should calculate metrics for value over goal", () => {
    const result = calculateProgressMetrics(150, 100);
    expect(result).toEqual({
      value: 150,
      goal: 100,
      hasValidValue: true,
      hasValidGoal: true,
      barPercent: 100 / 150, // goal / value when exceeded
      arrowPercent: 1, // Maxed at 1 when exceeded
    });
  });

  it("should calculate metrics for value equal to goal", () => {
    const result = calculateProgressMetrics(100, 100);
    expect(result).toEqual({
      value: 100,
      goal: 100,
      hasValidValue: true,
      hasValidGoal: true,
      barPercent: 1,
      arrowPercent: 1,
    });
  });

  it("should handle invalid values", () => {
    const result = calculateProgressMetrics(NaN, 100);
    expect(result).toEqual({
      value: NaN,
      goal: 100,
      hasValidValue: false,
      hasValidGoal: true,
      barPercent: 0,
      arrowPercent: 0,
    });
  });

  it("should handle invalid goals", () => {
    const result = calculateProgressMetrics(50, NaN);
    expect(result).toEqual({
      value: 50,
      goal: NaN,
      hasValidValue: true,
      hasValidGoal: false,
      barPercent: 0,
      arrowPercent: 0,
    });
  });

  it("should handle negative goals as invalid", () => {
    const result = calculateProgressMetrics(50, -10);
    expect(result).toEqual({
      value: 50,
      goal: -10,
      hasValidValue: true,
      hasValidGoal: false,
      barPercent: 0,
      arrowPercent: 0,
    });
  });

  it("should accept zero as valid goal", () => {
    const result = calculateProgressMetrics(50, 0);
    expect(result).toEqual({
      value: 50,
      goal: 0,
      hasValidValue: true,
      hasValidGoal: true,
      barPercent: 0, // goal / value = 0 / 50 = 0
      arrowPercent: 1, // value > goal, so maxed at 1
    });
  });

  it("should handle null and undefined values", () => {
    expect(calculateProgressMetrics(null as any, 100).hasValidValue).toBe(
      false,
    );
    expect(calculateProgressMetrics(undefined as any, 100).hasValidValue).toBe(
      false,
    );
    expect(calculateProgressMetrics(50, null as any).hasValidGoal).toBe(false);
    expect(calculateProgressMetrics(50, undefined as any).hasValidGoal).toBe(
      false,
    );
  });
});

describe("getProgressColors", () => {
  it("should return different colors when goal is exceeded", () => {
    const result = getProgressColors("#3366ff", 150, 100);

    expect(result.background).toBe(result.dark);
    expect(result.pointer).toBe(result.dark);
  });

  it("should handle named colors and convert to hex", () => {
    const result = getProgressColors("red", 50, 100);

    expect(result.main).toBe("#FF0000");
    expect(result.foreground).toBe("#FF0000");
  });

  it("should handle RGB colors and convert to hex", () => {
    const result = getProgressColors("rgb(255, 0, 0)", 50, 100);

    expect(result.main).toBe("#FF0000");
    expect(result.foreground).toBe("#FF0000");
  });

  it("should handle HSL colors and convert to hex", () => {
    const result = getProgressColors("hsl(0, 100%, 50%)", 50, 100);

    expect(result.main).toBe("#FF0000");
    expect(result.foreground).toBe("#FF0000");
  });
});

describe("getProgressMessage", () => {
  const createMetrics = (
    value: number,
    goal: number,
    hasValidValue = true,
    hasValidGoal = true,
  ): ProgressMetrics => ({
    value,
    goal,
    hasValidValue,
    hasValidGoal,
    barPercent: 0,
    arrowPercent: 0,
  });

  it("should return 'Goal met' when value equals goal", () => {
    const metrics = createMetrics(100, 100);
    expect(getProgressMessage(metrics)).toBe(t`Goal met`);
  });

  it("should return 'Goal exceeded' when value is greater than goal", () => {
    const metrics = createMetrics(150, 100);
    expect(getProgressMessage(metrics)).toBe(t`Goal exceeded`);
  });

  it("should return empty string when value is less than goal", () => {
    const metrics = createMetrics(75, 100);
    expect(getProgressMessage(metrics)).toBe("");
  });

  it("should return 'No data available' when both value and goal are invalid", () => {
    const metrics = createMetrics(NaN, NaN, false, false);
    expect(getProgressMessage(metrics)).toBe(t`No data available`);
  });

  it("should return 'No value data' when only value is invalid", () => {
    const metrics = createMetrics(NaN, 100, false, true);
    expect(getProgressMessage(metrics)).toBe(t`No value data`);
  });

  it("should return 'No goal set' when only goal is invalid", () => {
    const metrics = createMetrics(75, NaN, true, false);
    expect(getProgressMessage(metrics)).toBe(t`No goal set`);
  });

  it("should prioritize 'No data available' over other messages", () => {
    const metrics = createMetrics(100, 100, false, false); // Both invalid but values happen to be equal
    expect(getProgressMessage(metrics)).toBe(t`No data available`);
  });

  it("should handle zero values correctly", () => {
    const metrics = createMetrics(0, 0);
    expect(getProgressMessage(metrics)).toBe(t`Goal met`);
  });
});
