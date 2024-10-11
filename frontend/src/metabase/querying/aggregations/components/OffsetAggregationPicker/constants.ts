import { t } from "ttag";

import type { TemporalUnit } from "metabase-types/api";

import type { ColumnType, ComparisonType } from "./types";

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
    "minute-of-hour": "minute",
    "hour-of-day": "hour",
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

export const COLUMN_TYPE_NAMES: Record<ColumnType, string> = {
  offset: t`Previous value`,
  "diff-offset": t`Value difference`,
  "percent-diff-offset": t`Percentage difference`,
  "moving-average": t`Moving average value`,
  "diff-moving-average": t`Value difference with moving average`,
  "percent-diff-moving-average": t`Percentage difference with moving average`,
};
