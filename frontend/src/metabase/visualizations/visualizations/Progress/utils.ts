import Color from "color";
import { t } from "ttag";
import _ from "underscore";

import { isNumeric } from "metabase-lib/v1/types/utils/isa";
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

export const extractProgressValue = (
  rows: RowValues[],
  columnIndex: number,
): number => {
  if (rows[0] != null) {
    const rawValue = rows[0][columnIndex];
    if (rawValue === null || rawValue === undefined) {
      return 0;
    } else if (rawValue === "Infinity") {
      return Infinity;
    } else if (typeof rawValue === "number") {
      return rawValue;
    } else {
      return 0;
    }
  }
  return getValue(rows);
};

export const findProgressColumn = (
  cols: DatasetColumn[],
  valueField?: string,
): DatasetColumn | undefined => {
  if (valueField) {
    return _.find(cols, (col) => col.name === valueField);
  }
  return cols.find(isNumeric) || cols[0];
};

export interface ProgressMetrics {
  value: number;
  goal: number;
  hasValidValue: boolean;
  hasValidGoal: boolean;
  barPercent: number;
  arrowPercent: number;
}

export const calculateProgressMetrics = (
  value: number,
  goal: number,
): ProgressMetrics => {
  const hasValidValue = value !== null && value !== undefined && !isNaN(value);
  const hasValidGoal =
    goal !== null && goal !== undefined && !isNaN(goal) && goal >= 0;

  let barPercent = 0;
  let arrowPercent = 0;

  if (hasValidValue && hasValidGoal) {
    barPercent = barPercent =
      value === goal
        ? 1
        : Math.max(0, value < goal ? value / goal : goal / value);
    arrowPercent = Math.max(0, value < goal ? value / goal : 1);
  }

  return {
    value,
    goal,
    hasValidValue,
    hasValidGoal,
    barPercent,
    arrowPercent,
  };
};

export interface ProgressColors {
  main: string;
  light: string;
  dark: string;
  foreground: string;
  background: string;
  pointer: string;
}

export const getProgressColors = (
  mainColor: string,
  value: number,
  goal: number,
): ProgressColors => {
  const mainHex = Color(mainColor).hex();
  const light = Color(mainColor).lighten(0.25).hex();
  const dark = Color(mainColor).darken(0.3).hex();
  const isExceeded = value > goal;

  return {
    main: mainHex,
    light,
    dark,
    foreground: mainHex,
    background: isExceeded ? dark : light,
    pointer: isExceeded ? dark : mainHex,
  };
};

export const getProgressMessage = (metrics: ProgressMetrics): string => {
  const { value, goal, hasValidValue, hasValidGoal } = metrics;

  if (!hasValidValue && !hasValidGoal) {
    return t`No data available`;
  } else if (!hasValidValue) {
    return t`No value data`;
  } else if (!hasValidGoal) {
    return t`No goal set`;
  } else if (value === goal) {
    return t`Goal met`;
  } else if (value > goal) {
    return t`Goal exceeded`;
  }

  return "";
};
