import { t } from "ttag";
import moment from "moment-timezone";
import { HelpText, HelpTextConfig } from "metabase-lib/expressions/types";
import type Database from "metabase-lib/metadata/Database";
import {
  formatIdentifier,
  formatStringLiteral,
} from "metabase-lib/expressions";

const getDescriptionForNow: HelpTextConfig["description"] = (
  database,
  reportTimezone,
) => {
  const hasTimezoneFeatureFlag = database.features.includes("set-timezone");
  const timezone = hasTimezoneFeatureFlag ? reportTimezone : "UTC";
  const nowAtTimezone = getNowAtTimezone(timezone, reportTimezone);

  // H2 is the only DBMS we support where:
  // · set-timezone isn't a feature, and
  // · it's possible for now to be in the system timezone, not UTC.
  // also H2 is not recommended for use in production, so for now we skip
  // deeper logic to support displaying timestamps in it.
  if (database.engine === "h2") {
    return t`Returns the current timestamp (in milliseconds).`;
  } else {
    return t`Returns the current timestamp (in milliseconds). Currently ${nowAtTimezone} in ${timezone}.`;
  }
};

const getNowAtTimezone = (
  timezone: string | undefined,
  reportTimezone: string | undefined,
) =>
  timezone && reportTimezone
    ? moment().tz(reportTimezone).format("LT")
    : moment().format("LT");

const HELPER_TEXT_STRINGS: HelpTextConfig[] = [
  {
    name: "count",
    structure: "Count",
    description: () => t`Returns the count of rows in the selected data.`,
  },
  {
    name: "cum-count",
    structure: "CumulativeCount",
    description: () => t`The additive total of rows across a breakout.`,
  },
  {
    name: "sum",
    structure: "Sum",
    description: () => t`Adds up all the values of the column.`,
    args: [
      {
        name: t`column`,
        description: t`The column or number to sum.`,
        example: formatIdentifier(t`Subtotal`),
      },
    ],
  },
  {
    name: "cum-sum",
    structure: "CumulativeSum",
    description: () => t`The rolling sum of a column across a breakout.`,
    args: [
      {
        name: t`column`,
        description: t`The column or number to sum.`,
        example: formatIdentifier(t`Subtotal`),
      },
    ],
  },
  {
    name: "distinct",
    structure: "Distinct",
    description: () => t`The number of distinct values in this column.`,
    args: [
      {
        name: t`column`,
        description: t`The column whose distinct values to count.`,
        example: formatIdentifier(t`Last Name`),
      },
    ],
  },
  {
    name: "stddev",
    structure: "StandardDeviation",
    description: () => t`Calculates the standard deviation of the column.`,
    args: [
      {
        name: t`column`,
        description: t`The numeric column to get standard deviation of.`,
        example: formatIdentifier(t`Population`),
      },
    ],
  },
  {
    name: "avg",
    structure: "Average",
    description: () => t`Returns the average of the values in the column.`,
    args: [
      {
        name: t`column`,
        description: t`The numeric column whose values to average.`,
        example: formatIdentifier(t`Quantity`),
      },
    ],
  },
  {
    name: "median",
    structure: "Median",
    description: () => t`Returns the median of all the values of a column.`,
    args: [
      {
        name: t`column`,
        description: t`The numeric column whose values to average.`,
        example: formatIdentifier(t`Quantity`),
      },
    ],
  },
  {
    name: "min",
    structure: "Min",
    description: () => t`Returns the smallest value found in the column`,
    args: [
      {
        name: t`column`,
        description: t`The numeric column whose minimum you want to find.`,
        example: formatIdentifier(t`Salary`),
      },
    ],
  },
  {
    name: "max",
    structure: "Max",
    description: () => t`Returns the largest value found in the column.`,
    args: [
      {
        name: t`column`,
        description: t`The numeric column whose maximum you want to find.`,
        example: formatIdentifier(t`Age`),
      },
    ],
  },
  {
    name: "share",
    structure: "Share",
    description: () =>
      t`Returns the percent of rows in the data that match the condition, as a decimal.`,
    args: [
      {
        name: t`condition`,
        description: t`Something that should evaluate to true or false.`,
        example: `${formatIdentifier(t`Source`)} = ${formatStringLiteral(
          t`Google`,
        )}`,
      },
    ],
  },
  {
    name: "count-where",
    structure: "CountIf",
    description: () => t`Only counts rows where the condition is true.`,
    args: [
      {
        name: t`condition`,
        description: t`Something that should evaluate to true or false.`,
        example: `${formatIdentifier(t`Subtotal`)} > 100`,
      },
    ],
  },
  {
    name: "sum-where",
    structure: "SumIf",
    description: () =>
      t`Sums up the specified column only for rows where the condition is true.`,
    args: [
      {
        name: t`column`,
        description: t`The numeric column to sum.`,
        example: formatIdentifier(t`Subtotal`),
      },
      {
        name: t`condition`,
        description: t`Something that should evaluate to true or false.`,
        example: `${formatIdentifier(t`Order Status`)} = ${formatStringLiteral(
          t`Valid`,
        )}`,
      },
    ],
  },
  {
    name: "var",
    structure: "Variance",
    description: () => t`Returns the numeric variance for a given column.`,
    args: [
      {
        name: t`column`,
        description: t`The column or number to get the variance of.`,
        example: formatIdentifier(t`Temperature`),
      },
    ],
  },
  {
    name: "median",
    structure: "Median",
    description: () => t`Returns the median value of the specified column.`,
    args: [
      {
        name: t`column`,
        description: t`The column or number to get the median of.`,
        example: formatIdentifier(t`Age`),
      },
    ],
  },
  {
    name: "percentile",
    structure: "Percentile",
    description: () =>
      t`Returns the value of the column at the percentile value.`,
    args: [
      {
        name: t`column`,
        description: t`The column or number to get the percentile of.`,
        example: formatIdentifier(t`Score`),
      },
      {
        name: t`percentile-value`,
        description: t`The value of the percentile.`,
        example: "0.9",
      },
    ],
  },
  {
    name: "lower",
    structure: "lower",
    description: () => t`Returns the string of text in all lower case.`,
    args: [
      {
        name: t`text`,
        description: t`The column with values to convert to lower case.`,
        example: formatIdentifier(t`Status`),
      },
    ],
  },
  {
    name: "upper",
    structure: "upper",
    description: () => t`Returns the text in all upper case.`,
    args: [
      {
        name: t`text`,
        description: t`The column with values to convert to upper case.`,
        example: formatIdentifier(t`Status`),
      },
    ],
  },
  {
    name: "substring",
    structure: "substring",
    description: () => t`Returns a portion of the supplied text.`,
    args: [
      {
        name: t`text`,
        description: t`The column or text to return a portion of.`,
        example: formatIdentifier(t`Title`),
      },
      {
        name: t`position`,
        description: t`The position to start copying characters. Index starts at position 1.`,
        example: "1",
      },
      {
        name: t`length`,
        description: t`The number of characters to return.`,
        example: "10",
      },
    ],
    docsPage: "substring",
  },
  {
    name: "regex-match-first",
    structure: "regexextract",
    description: () =>
      t`Extracts matching substrings according to a regular expression.`,
    args: [
      {
        name: t`text`,
        description: t`The column or text to search through.`,
        example: formatIdentifier(t`Address`),
      },
      {
        name: t`regular_expression`,
        description: t`The regular expression to match.`,
        example: formatStringLiteral("[0-9]+"),
      },
    ],
    docsPage: "regexextract",
  },
  {
    name: "concat",
    structure: "concat",
    description: () => t`Combine two or more strings of text together.`,
    args: [
      {
        name: t`value1`,
        description: t`The column or text to begin with.`,
        example: formatIdentifier(t`Last Name`),
      },
      {
        name: t`value2`,
        description: t`This will be added to the end of value1.`,
        example: formatStringLiteral(", "),
      },
      {
        name: "…",
        description: t`This will be added to the end of value2, and so on.`,
        example: formatIdentifier(t`First Name`),
      },
    ],
    docsPage: "concat",
  },
  {
    name: "replace",
    structure: "replace",
    description: () => t`Replaces a part of the input text with new text.`,
    args: [
      {
        name: t`text`,
        description: t`The column or text to search through.`,
        example: formatIdentifier(t`Title`),
      },
      {
        name: t`find`,
        description: t`The text to find.`,
        example: formatStringLiteral(t`Enormous`),
      },
      {
        name: t`replace`,
        description: t`The text to use as the replacement.`,
        example: formatStringLiteral(t`Gigantic`),
      },
    ],
  },
  {
    name: "length",
    structure: "length",
    description: () => t`Returns the number of characters in text.`,
    args: [
      {
        name: t`text`,
        description: t`The column or text you want to get the length of.`,
        example: formatIdentifier(t`Comment`),
      },
    ],
  },
  {
    name: "trim",
    structure: "trim",
    description: () =>
      t`Removes leading and trailing whitespace from a string of text.`,
    args: [
      {
        name: t`text`,
        description: t`The column or text you want to trim.`,
        example: formatIdentifier(t`Comment`),
      },
    ],
  },
  {
    name: "rtrim",
    structure: "rtrim",
    description: () => t`Removes trailing whitespace from a string of text.`,
    args: [
      {
        name: t`text`,
        description: t`The column or text you want to trim.`,
        example: formatIdentifier(t`Comment`),
      },
    ],
  },
  {
    name: "ltrim",
    structure: "ltrim",
    description: () => t`Removes leading whitespace from a string of text.`,
    args: [
      {
        name: t`text`,
        description: t`The column or text you want to trim.`,
        example: formatIdentifier(t`Comment`),
      },
    ],
  },
  {
    name: "abs",
    structure: "abs",
    description: () =>
      t`Returns the absolute (positive) value of the specified column.`,
    args: [
      {
        name: t`column`,
        description: t`The column or number to return absolute (positive) value of.`,
        example: formatIdentifier(t`Debt`),
      },
    ],
  },
  {
    name: "floor",
    structure: "floor",
    description: () => t`Rounds a decimal number down.`,
    args: [
      {
        name: t`column`,
        description: t`The column or number to round down.`,
        example: formatIdentifier(t`Price`),
      },
    ],
  },
  {
    name: "ceil",
    structure: "ceil",
    description: () => t`Rounds a decimal number up.`,
    args: [
      {
        name: t`column`,
        description: t`The column or number to round up.`,
        example: formatIdentifier(t`Price`),
      },
    ],
  },
  {
    name: "round",
    structure: "round",
    description: () =>
      t`Rounds a decimal number either up or down to the nearest integer value.`,
    args: [
      {
        name: t`column`,
        description: t`The column or number to round to nearest integer.`,
        example: formatIdentifier(t`Temperature`),
      },
    ],
  },
  {
    name: "sqrt",
    structure: "sqrt",
    description: () => t`Returns the square root.`,
    args: [
      {
        name: t`column`,
        description: t`The column or number to return square root value of.`,
        example: formatIdentifier(t`Hypotenuse`),
      },
    ],
  },
  {
    name: "power",
    structure: "power",
    description: () => t`Raises a number to the power of the exponent value.`,
    args: [
      {
        name: t`column`,
        description: t`The column or number raised to the exponent.`,
        example: formatIdentifier(t`Length`),
      },
      {
        name: t`exponent`,
        description: t`The value of the exponent.`,
        example: "2",
      },
    ],
  },
  {
    name: "log",
    structure: "log",
    description: () => t`Returns the base 10 log of the number.`,
    args: [
      {
        name: t`column`,
        description: t`The column or number to return the natural logarithm value of.`,
        example: formatIdentifier(t`Value`),
      },
    ],
  },
  {
    name: "datetime-diff",
    structure: "datetimeDiff",
    description: () =>
      t`Get the difference between two datetime values (datetime2 minus datetime1) using the specified unit of time.`,
    args: [
      {
        name: t`datetime1`,
        description: t`The column or expression with your datetime value.`,
        example: formatIdentifier(t`created_at`),
      },
      {
        name: t`datetime2`,
        description: t`The column or expression with your datetime value.`,
        example: formatIdentifier(t`shipped_at`),
      },
      {
        name: t`unit`,
        description: t`Choose from: ${"year"}, ${"quarter"}, ${"month"}, ${"week"}, ${"day"}, ${"hour"}, ${"minute"}, ${"second"}, or ${"millisecond"}.`,
        example: formatStringLiteral("month"),
      },
    ],
    docsPage: "datetimediff",
  },
  {
    name: "exp",
    structure: "exp",
    description: () =>
      t`Returns Euler's number, e, raised to the power of the supplied number.`,
    args: [
      {
        name: t`column`,
        description: t`The column or number to return the exponential value of.`,
        example: formatIdentifier(t`Interest Months`),
      },
    ],
  },
  {
    name: "contains",
    structure: "contains",
    description: () => t`Checks to see if string1 contains string2 within it.`,
    args: [
      {
        name: t`string1`,
        description: t`The column or text to check.`,
        example: formatIdentifier(t`Status`),
      },
      {
        name: t`string2`,
        description: t`The string of text to look for.`,
        example: formatStringLiteral(t`Pass`),
      },
    ],
  },
  {
    name: "does-not-contain",
    structure: "doesNotContain",
    description: () =>
      t`Checks to see if string1 does not contain string2 within it.`,
    args: [
      {
        name: t`string1`,
        description: t`The column or text to check.`,
        example: formatIdentifier(t`Status`),
      },
      {
        name: t`string2`,
        description: t`The string of text to look for.`,
        example: formatStringLiteral(t`Pass`),
      },
    ],
  },
  {
    name: "starts-with",
    structure: "startsWith",
    description: () =>
      t`Returns true if the beginning of the text matches the comparison text.`,
    args: [
      {
        name: t`text`,
        description: t`The column or text to check.`,
        example: formatIdentifier(t`Course Name`),
      },
      {
        name: t`comparison`,
        description: t`The string of text that the original text should start with.`,
        example: formatStringLiteral(t`Computer Science`),
      },
    ],
  },
  {
    name: "ends-with",
    structure: "endsWith",
    description: () =>
      t`Returns true if the end of the text matches the comparison text.`,
    args: [
      {
        name: t`text`,
        description: t`The column or text to check.`,
        example: formatIdentifier(t`Appetite`),
      },
      {
        name: t`comparison`,
        description: t`The string of text that the original text should end with.`,
        example: formatStringLiteral(t`hungry`),
      },
    ],
  },
  {
    name: "between",
    structure: "between",
    description: () =>
      t`Checks a date or number column's values to see if they're within the specified range.`,
    args: [
      {
        name: t`column`,
        description: t`The date or numeric column that should be within the start and end values.`,
        example: formatIdentifier(t`Created At`),
      },
      {
        name: t`start`,
        description: t`The beginning of the range.`,
        example: formatStringLiteral("2019-01-01"),
      },
      {
        name: t`end`,
        description: t`The end of the range.`,
        example: formatStringLiteral("2022-12-31"),
      },
    ],
  },
  {
    name: "interval",
    structure: "timeSpan",
    description: () => t`Gets a time interval of specified length`,
    args: [
      {
        name: t`number`,
        description: t`Period of interval, where negative values are back in time.`,
        example: "7",
      },
      {
        name: t`text`,
        description: t`Type of interval like ${"day"}, ${"month"}, ${"year"}.`,
        example: formatStringLiteral("day"),
      },
    ],
  },
  {
    name: "time-interval",
    structure: "interval",
    description: () =>
      t`Checks a date column's values to see if they're within the relative range.`,
    args: [
      {
        name: t`column`,
        description: t`The date column to return interval of.`,
        example: formatIdentifier(t`Created At`),
      },
      {
        name: t`number`,
        description: t`Period of interval, where negative values are back in time.`,
        example: "-1",
      },
      {
        name: t`text`,
        description: t`Type of interval like ${"day"}, ${"month"}, ${"year"}.`,
        example: formatStringLiteral("month"),
      },
    ],
  },
  {
    name: "relative-datetime",
    structure: "relativeDateTime",
    description: () => t`Gets a timestamp relative to the current time`,
    args: [
      {
        name: t`number`,
        description: t`Period of interval, where negative values are back in time.`,
        example: "-30",
      },
      {
        name: t`text`,
        description: t`Type of interval like ${"day"}, ${"month"}, ${"year"}.`,
        example: formatStringLiteral("day"),
      },
    ],
  },
  {
    name: "is-null",
    structure: "isnull",
    description: () => t`Checks if a column is null`,
    args: [
      {
        name: t`column`,
        description: t`The column to check.`,
        example: formatIdentifier(t`Discount`),
      },
    ],
    docsPage: "isnull",
  },
  {
    name: "not-null",
    structure: "notnull",
    description: () => t`Checks if a column is not null`,
    args: [
      {
        name: t`column`,
        description: t`The column to check.`,
        example: formatIdentifier(t`Discount`),
      },
    ],
  },
  {
    name: "is-empty",
    structure: "isempty",
    description: () => t`Checks if a column is empty`,
    args: [
      {
        name: t`column`,
        description: t`The column to check.`,
        example: formatIdentifier(t`Name`),
      },
    ],
    docsPage: "isempty",
  },
  {
    name: "not-empty",
    structure: "notempty",
    description: () => t`Checks if a column is not empty`,
    args: [
      {
        name: t`column`,
        description: t`The column to check.`,
        example: formatIdentifier(t`Name`),
      },
    ],
  },
  {
    name: "coalesce",
    structure: "coalesce",
    description: () =>
      t`Looks at the values in each argument in order and returns the first non-null value for each row.`,
    args: [
      {
        name: t`value1`,
        description: t`The column or value to return.`,
        example: formatIdentifier(t`Comments`),
      },
      {
        name: t`value2`,
        description: t`If value1 is empty, value2 gets returned if its not empty.`,
        example: formatIdentifier(t`Notes`),
      },
      {
        name: "…",
        description: t`If value1 is empty, and value2 is empty, the next non-empty one will be returned.`,
        example: formatStringLiteral(t`No comments`),
      },
    ],
    docsPage: "coalesce",
  },
  {
    name: "case",
    structure: "case",
    description: () =>
      t`Tests an expression against a list of cases and returns the corresponding value of the first matching case, with an optional default value if nothing else is met.`,
    args: [
      {
        name: t`condition`,
        description: t`Something that should evaluate to true or false.`,
        example: `${formatIdentifier(t`Weight`)} > 200`,
      },
      {
        name: t`output`,
        description: t`The value that will be returned if the preceding condition is true.`,
        example: formatStringLiteral(t`Large`),
      },
      {
        name: "…",
        description: t`You can add more conditions to test.`,
        example: `${formatIdentifier(t`Weight`)} > 150, ${formatStringLiteral(
          t`Medium`,
        )}, ${formatStringLiteral(t`Small`)}`,
      },
    ],
    docsPage: "case",
  },
  {
    name: "get-year",
    structure: "year",
    description: () =>
      t`Takes a datetime and returns an integer with the number of the year.`,
    args: [
      {
        name: t`column`,
        description: t`The datetime column.`,
        example: formatIdentifier(t`Created At`),
      },
    ],
  },
  {
    name: "get-quarter",
    structure: "quarter",
    description: () =>
      t`Takes a datetime and returns an integer (1-4) with the number of the quarter in the year.`,
    args: [
      {
        name: t`column`,
        description: t`The datetime column.`,
        example: formatIdentifier(t`Created At`),
      },
    ],
  },
  {
    name: "get-month",
    structure: "month",
    description: () =>
      t`Takes a datetime and returns an integer (1-12) with the number of the month in the year.`,
    args: [
      {
        name: t`column`,
        description: t`The datetime column.`,
        example: formatIdentifier(t`Created At`),
      },
    ],
  },
  {
    name: "get-week",
    structure: "week",
    description: () => t`Extracts the week of the year as an integer.`,
    args: [
      {
        name: t`column`,
        description: t`The name of the column with your date or datetime value.`,
        example: formatIdentifier(t`Created At`),
      },
      {
        name: t`mode`,
        description: t`Optional. The default is "ISO".
- ISO: Week 1 starts on the Monday before the first Thursday of January.
- US: Week 1 starts on Jan 1. All other weeks start on Sunday.
- Instance: Week 1 starts on Jan 1. All other weeks start on the day defined in your Metabase localization settings.
`,
        example: formatStringLiteral("iso"),
      },
    ],
  },
  {
    name: "get-day",
    structure: "day",
    description: () =>
      t`Takes a datetime and returns an integer (1-31) with the number of the day of the month.`,
    args: [
      {
        name: t`column`,
        description: t`The datetime column.`,
        example: formatIdentifier(t`Created At`),
      },
    ],
  },
  {
    name: "get-day-of-week",
    structure: "weekday",
    description: () =>
      t`Takes a datetime and returns an integer (1-7) with the number of the day of the week.`,
    args: [
      {
        name: t`column`,
        description: t`The datetime column.`,
        example: formatIdentifier(t`Created At`),
      },
    ],
  },
  {
    name: "get-hour",
    structure: "hour",
    description: () =>
      t`Takes a datetime and returns an integer (0-23) with the number of the hour. No AM/PM.`,
    args: [
      {
        name: t`column`,
        description: t`The datetime column.`,
        example: formatIdentifier(t`Created At`),
      },
    ],
  },
  {
    name: "get-minute",
    structure: "minute",
    description: () =>
      t`Takes a datetime and returns an integer (0-59) with the number of the minute in the hour.`,
    args: [
      {
        name: t`column`,
        description: t`The datetime column.`,
        example: formatIdentifier(t`Created At`),
      },
    ],
  },
  {
    name: "get-second",
    structure: "second",
    description: () =>
      t`Takes a datetime and returns an integer (0-59) with the number of the seconds in the minute.`,
    args: [
      {
        name: t`column`,
        description: t`The datetime column.`,
        example: formatIdentifier(t`Created At`),
      },
    ],
  },
  {
    name: "datetime-add",
    structure: "datetimeAdd",
    description: () => t`Adds some units of time to a date or timestamp value.`,
    args: [
      {
        name: t`column`,
        description: t`The column with your date or timestamp values.`,
        example: formatIdentifier(t`Created At`),
      },
      {
        name: t`amount`,
        description: t`The number of units to be added.`,
        example: "1",
      },
      {
        name: t`unit`,
        description: t`Choose from: ${"year"}, ${"quarter"}, ${"month"}, ${"week"}, ${"day"}, ${"hour"}, ${"minute"}, ${"second"}, or ${"millisecond"}.`,
        example: formatStringLiteral("month"),
      },
    ],
    docsPage: "datetimeadd",
  },
  {
    name: "datetime-subtract",
    structure: "datetimeSubtract",
    description: () =>
      t`Subtracts some units of time to a date or timestamp value.`,
    args: [
      {
        name: t`column`,
        description: t`The column with your date or timestamp values.`,
        example: formatIdentifier(t`Created At`),
      },
      {
        name: t`amount`,
        description: t`The number of units to be subtracted.`,
        example: "1",
      },
      {
        name: t`unit`,
        description: t`Choose from: ${"year"}, ${"quarter"}, ${"month"}, ${"week"}, ${"day"}, ${"hour"}, ${"minute"}, ${"second"}, or ${"millisecond"}.`,
        example: formatStringLiteral("month"),
      },
    ],
    docsPage: "datetimesubtract",
  },
  {
    name: "now",
    structure: "now",
    description: getDescriptionForNow,
  },
  {
    name: "convert-timezone",
    structure: "convertTimezone",
    description: () => t`Convert timezone of a date or timestamp column.
We support tz database time zone names.
See the full list here: https://w.wiki/4Jx`,
    args: [
      {
        name: t`column`,
        description: t`The column with your date or timestamp values.`,
        example: formatIdentifier(t`Created At`),
      },
      {
        name: t`target`,
        description: t`The timezone you want to assign to your column.`,
        example: formatStringLiteral("Asia/Ho_Chi_Minh"),
      },
      {
        name: t`source`,
        description: t`The current time zone. Only required for timestamps with no time zone.`,
        example: formatStringLiteral("UTC"),
      },
    ],
    docsPage: "converttimezone",
  },
];

export const getHelpText = (
  name: string,
  database: Database,
  reportTimezone?: string,
): HelpText | undefined => {
  const helperTextConfig = HELPER_TEXT_STRINGS.find(h => h.name === name);

  if (!helperTextConfig) {
    return;
  }

  const { description } = helperTextConfig;

  return {
    ...helperTextConfig,
    example: getHelpExample(helperTextConfig),
    description: description(database, reportTimezone),
  };
};

const getHelpExample = ({ structure, args }: HelpTextConfig): string => {
  const exampleParameters =
    args?.length && args.map(({ example }) => example).join(", ");

  return `${structure}${exampleParameters ? `(${exampleParameters})` : ""}`;
};
