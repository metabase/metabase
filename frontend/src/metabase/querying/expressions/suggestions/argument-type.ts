import { t } from "ttag";

import * as Lib from "metabase-lib";

import { getClauseDefinition } from "../clause";
import { enclosingFunction } from "../position";

export type ExpectedColumnType = {
  test: (column: Lib.ColumnMetadata) => boolean;
  /** The message shown when no column fits, for the word typed so far. */
  getEmptyMessage: (word: string) => string;
};

/**
 * Values that take a whole number, which the function definitions don't say
 * (they call it a number). By display name, then 0-based position.
 */
const WHOLE_NUMBER_VALUES: Record<string, number[]> = {
  dayName: [0],
  monthName: [0],
  quarterName: [0],
  interval: [1],
  splitPart: [2],
  substring: [1, 2],
};

/** Values that must be typed out, like a unit ("day"): no column works. */
const TYPED_VALUES: Record<string, number[]> = {
  collate: [1],
  convertTimezone: [1, 2],
  datetimeAdd: [1, 2],
  datetimeDiff: [2],
  datetimeSubtract: [1, 2],
  interval: [2],
  intervalStartingFrom: [1, 2, 3, 4],
  Percentile: [1],
  relativeDateTime: [0, 1],
  replace: [1, 2],
  splitPart: [1],
  timeSpan: [0, 1],
  week: [1],
};

const UNITS = [
  "year",
  "quarter",
  "month",
  "week",
  "day",
  "hour",
  "minute",
  "second",
] as const;

const UNITS_WITH_MILLISECONDS = [...UNITS, "millisecond"] as const;

const TIME_ZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Africa/Johannesburg",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Australia/Sydney",
] as const;

/**
 * The text values that a typed value takes, by display name, then 0-based
 * position. Only these work there, so they replace the columns.
 */
const ALLOWED_VALUES: Record<string, Record<number, readonly string[]>> = {
  convertTimezone: { 1: TIME_ZONES, 2: TIME_ZONES },
  datetimeAdd: { 2: UNITS_WITH_MILLISECONDS },
  datetimeDiff: { 2: UNITS },
  datetimeSubtract: { 2: UNITS_WITH_MILLISECONDS },
  interval: { 2: UNITS },
  intervalStartingFrom: { 2: UNITS, 4: UNITS },
  relativeDateTime: { 1: UNITS },
  timeSpan: { 1: UNITS },
  week: { 1: ["iso", "us", "instance"] },
};

/**
 * Functions whose values after the first two may be more texts to look for,
 * or the option to ignore case: both columns and the option are offered.
 */
const CASE_OPTION_FUNCTIONS = new Set([
  "contains",
  "doesNotContain",
  "startsWith",
  "endsWith",
]);

export type AllowedValues = {
  values: readonly string[];
  /** Only these values work: no column fits there. */
  isExclusive: boolean;
};

/** The text values that the value at `pos` takes, or null for any value. */
export function getAllowedValues(
  source: string,
  pos: number,
): AllowedValues | null {
  const fn = enclosingFunction(source, pos);
  const clause = fn?.arg != null ? getClauseDefinition(fn.name) : undefined;
  if (fn?.arg == null || !clause) {
    return null;
  }
  const values = ALLOWED_VALUES[clause.displayName]?.[fn.arg.index];
  if (values) {
    return { values, isExclusive: true };
  }
  if (CASE_OPTION_FUNCTIONS.has(clause.displayName) && fn.arg.index >= 2) {
    return { values: ["case-insensitive"], isExclusive: false };
  }
  return null;
}

/**
 * The columns that the value at `pos` takes, from the innermost function
 * around it, or null when any column fits.
 *
 * A value that must be true or false isn't restricted: a condition usually
 * starts with a column of another type, as in `case([Total] > 100, …)`.
 */
export function getExpectedColumnType(
  source: string,
  pos: number,
): ExpectedColumnType | null {
  const fn = enclosingFunction(source, pos);
  if (fn?.arg == null) {
    return null;
  }

  const clause = getClauseDefinition(fn.name);
  if (!clause) {
    return null;
  }

  const index = fn.arg.index;
  if (TYPED_VALUES[clause.displayName]?.includes(index)) {
    return {
      test: () => false,
      getEmptyMessage: () => t`This value can't be a column. Type it instead.`,
    };
  }
  if (WHOLE_NUMBER_VALUES[clause.displayName]?.includes(index)) {
    return ofType(Lib.isInteger, t`whole number`);
  }

  // "…" stands for more values like the last named one. Some functions mark
  // it with a stricter type than they accept, like concat(), so use the type
  // of the last named value instead.
  const namedArgs = clause.args.filter((arg) => arg.name !== "…");
  const isRepeated = namedArgs.length < clause.args.length;
  const arg = namedArgs[index] ?? (isRepeated ? namedArgs.at(-1) : undefined);

  switch (arg?.type) {
    case "string":
      return ofType(Lib.isStringOrStringLike, t`text`);
    case "number":
      return ofType(Lib.isNumeric, t`number`);
    case "datetime":
      return ofType(Lib.isTemporal, t`date`);
    default:
      return null;
  }
}

// The blanks of a template are named after the type of column they take, with
// a number when it needs two different columns of that type: "[Number 2]".
const TEMPLATE_BLANK = /^\[(Text|Number|Date)(?: \d+)?\]$/;

/**
 * The columns that a template's blank takes, from its name, like `[Date]`, or
 * null for one that takes any column, like `[Column]`.
 */
export function getTemplateBlankType(blank: string): ExpectedColumnType | null {
  const kind = TEMPLATE_BLANK.exec(blank)?.[1];
  switch (kind) {
    case "Text":
      return ofType(Lib.isStringOrStringLike, t`text`);
    case "Number":
      return ofType(Lib.isNumeric, t`number`);
    case "Date":
      return ofType(Lib.isTemporal, t`date`);
    default:
      return null;
  }
}

function ofType(
  test: ExpectedColumnType["test"],
  noun: string,
): ExpectedColumnType {
  return {
    test,
    getEmptyMessage: (word) =>
      word === ""
        ? t`There are no ${noun} columns to use here.`
        : t`No ${noun} columns match "${word}".`,
  };
}
