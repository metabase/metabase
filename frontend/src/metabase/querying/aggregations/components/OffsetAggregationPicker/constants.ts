import { t } from "ttag";

import type { TemporalUnit } from "metabase-types/api";

import type { ColumnType, ColumnTypeInfo, ComparisonType } from "./types";

export const OFFSET_UNITS: Partial<Record<TemporalUnit, TemporalUnit[]>> = {
  minute: ["minute", "minute-of-hour"],
  hour: ["hour", "hour-of-day"],
  day: ["day", "day-of-week", "day-of-month", "day-of-year"],
  week: ["week", "week-of-year"],
  month: ["month", "month-of-year"],
  quarter: ["quarter", "quarter-of-year"],
  year: ["year"],
};

export const OFFSET_DISPLAY_UNITS: Partial<Record<TemporalUnit, TemporalUnit>> =
  {
    "minute-of-hour": "hour",
    "hour-of-day": "day",
    "day-of-week": "week",
    "day-of-month": "month",
    "day-of-year": "year",
    "week-of-year": "year",
    "month-of-year": "year",
    "quarter-of-year": "year",
  };

export const COLUMN_TYPES: Record<ComparisonType, ColumnType[]> = {
  offset: ["offset", "percent-diff-offset", "diff-offset"],
  "moving-average": [
    "moving-average",
    "percent-diff-moving-average",
    "diff-moving-average",
  ],
};

export const COLUMN_TYPE_INFO: Record<ColumnType, ColumnTypeInfo> = {
  offset: {
    label: t`Previous value`,
    example: "1826, 3004",
  },
  "diff-offset": {
    label: t`Value difference`,
    example: "+42, -3",
  },
  "percent-diff-offset": {
    label: t`Percentage difference`,
    example: "+2.3%, -0.1%",
  },
  "moving-average": {
    label: t`Moving average value`,
    example: "1826, 3004",
  },
  "diff-moving-average": {
    label: t`Value difference with moving average`,
    example: "+42, -3",
  },
  "percent-diff-moving-average": {
    label: t`Percentage difference with moving average`,
    example: "+2.3%, -0.1%",
  },
};
