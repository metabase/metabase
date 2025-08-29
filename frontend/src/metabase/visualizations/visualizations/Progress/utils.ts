import type { DatasetColumn, RowValues } from "metabase-types/api";

export const getValue = (rows: RowValues[]) => {
  const rawValue = rows[0] && rows[0][0];

  if (rawValue === "Infinity") {
    return Infinity;
  }

  if (typeof rawValue !== "number") {
    return 0;
  }

  return rawValue;
};

export const getGoalValue = (
  goalSetting: number | string,
  columns: DatasetColumn[],
  rows: RowValues[],
): number => {
  if (typeof goalSetting === "number") {
    return goalSetting;
  }

  if (typeof goalSetting === "string") {
    const columnIndex = columns.findIndex((col) => col.name === goalSetting);

    if (columnIndex !== -1 && rows[0]) {
      const rawValue = rows[0][columnIndex];
      if (rawValue === null || rawValue === undefined) {
        return 0;
      }
      if (rawValue === "Infinity") {
        return Infinity;
      }
      if (typeof rawValue === "number") {
        return rawValue;
      }
    }
  }

  return 0;
};
