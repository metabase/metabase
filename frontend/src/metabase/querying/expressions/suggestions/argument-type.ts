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
