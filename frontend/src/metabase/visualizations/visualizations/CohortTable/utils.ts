import Color from "color";
import { c } from "ttag";

import { dayjs } from "metabase/dayjs";
import { alpha } from "metabase/ui/colors";
import * as Lib from "metabase-lib";
import type { DatasetData, RowValue } from "metabase-types/api";

import type {
  CohortCellDetail,
  CohortColumnName,
  CohortPeriod,
  CohortRow,
  CohortTooltipColumn,
  CohortValueFormat,
} from "./types";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}/;
const PERIODS: readonly CohortPeriod[] = ["day", "week", "month"];
const VALUE_FORMATS: readonly CohortValueFormat[] = ["percent", "counts"];

export const toPeriod = (value: unknown): CohortPeriod =>
  PERIODS.find((period) => period === value) ?? "week";

export const toValueFormat = (value: unknown): CohortValueFormat =>
  VALUE_FORMATS.find((format) => format === value) ?? "percent";

const isTooltipColumn = (value: unknown): value is CohortTooltipColumn =>
  typeof value === "object" &&
  value !== null &&
  "name" in value &&
  "title" in value &&
  typeof value.name === "string" &&
  typeof value.title === "string";

export const toTooltipColumns = (value: unknown): CohortTooltipColumn[] =>
  Array.isArray(value) ? value.filter(isTooltipColumn) : [];

const toNumber = (value: RowValue): number =>
  typeof value === "number" ? value : Number(value ?? 0);

const toKey = (value: RowValue): string =>
  value === null || value === undefined ? "" : String(value);

const getColumnIndexes = (
  data: DatasetData,
): Record<CohortColumnName, number> => {
  const indexOf = (name: CohortColumnName) =>
    data.cols.findIndex((col) => col.name === name);
  return {
    cohort: indexOf("cohort"),
    offset: indexOf("offset"),
    cohort_size: indexOf("cohort_size"),
    value: indexOf("value"),
  };
};

/** Groups the planner's (cohort, offset) rows into one row per cohort. */
export const pivotCohorts = (
  data: DatasetData,
  tooltipColumns: readonly CohortTooltipColumn[] = [],
): CohortRow[] => {
  const index = getColumnIndexes(data);
  const tooltipIndexes = tooltipColumns.map((column) => ({
    title: column.title,
    index: data.cols.findIndex((col) => col.name === column.name),
  }));
  const byKey = new Map<string, CohortRow>();
  for (const row of data.rows) {
    const key = toKey(row[index.cohort]);
    const cohort = byKey.get(key) ?? {
      key,
      size: toNumber(row[index.cohort_size]),
      values: new Map<number, number>(),
      details: new Map<number, CohortCellDetail[]>(),
    };
    const offset = toNumber(row[index.offset]);
    cohort.values.set(offset, toNumber(row[index.value]));
    // A missing value, like an average over nobody, leaves its line out.
    cohort.details.set(
      offset,
      tooltipIndexes.flatMap(({ title, index }) => {
        const value = row[index];
        return typeof value === "number" ? [{ title, value }] : [];
      }),
    );
    byKey.set(key, cohort);
  }
  return [...byKey.values()];
};

export const isDateCohort = (key: string): boolean => DATE_PATTERN.test(key);

/** A cohort's period `offset` lies in the future, so it has no data yet. */
export const isFuturePeriod = (
  key: string,
  offset: number,
  period: CohortPeriod,
): boolean =>
  isDateCohort(key) &&
  dayjs(key).add(offset, period).startOf(period).isAfter(dayjs());

export const formatCohortLabel = (
  key: string,
  period: CohortPeriod,
  { showYear }: { showYear: boolean },
): string => {
  if (!isDateCohort(key)) {
    return key === "" ? c("An empty cohort value").t`(empty)` : key;
  }
  const date = dayjs(key);
  if (period === "month") {
    return date.format(showYear ? "MMM YYYY" : "MMM");
  }
  return date.format(showYear ? "MMM D, YYYY" : "MMM D");
};

export const formatPeriodHeader = (period: CohortPeriod, offset: number) => {
  const unit = Lib.describeTemporalUnit(period);
  return c("{0} is a time unit such as Week, {1} is how many of them")
    .t`${unit} ${offset}`;
};

export const formatDetailValue = (value: number): string =>
  new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value);

export const formatCellValue = (
  value: number,
  format: CohortValueFormat,
): string =>
  format === "percent"
    ? `${Math.round(value * 100)}%`
    : new Intl.NumberFormat().format(value);

const MIN_TINT = 0.06;
const LIGHT_TEXT_THRESHOLD = 0.55;

/**
 * Background and text colors for a cell, by how full it is: `baseColor` at an
 * opacity that grows with the value. Light text only goes on a dark base.
 */
export const getCellColors = (
  value: number,
  max: number,
  baseColor: string,
): { background: string; isLightText: boolean } => {
  const share = max > 0 ? Math.min(Math.max(value / max, 0), 1) : 0;
  return {
    background: alpha(baseColor, MIN_TINT + share * (1 - MIN_TINT)),
    isLightText: share > LIGHT_TEXT_THRESHOLD && Color(baseColor).isDark(),
  };
};
