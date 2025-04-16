import moment from "moment-timezone"; // eslint-disable-line no-restricted-imports -- deprecated usage
import { t } from "ttag";

import type * as Lib from "metabase-lib";
import type {
  HelpText,
  HelpTextConfig,
} from "metabase-lib/v1/expressions/types";
import type Database from "metabase-lib/v1/metadata/Database";
import type { Expression } from "metabase-types/api";

import { isLiteral } from "./matchers";

const getDescriptionForNow: HelpTextConfig["description"] = (
  database,
  reportTimezone,
) => {
  const hasTimezoneFeatureFlag = database.features?.includes("set-timezone");
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

// some of the structure names below are duplicated in src/metabase/lib/expression.cljc
const HELPER_TEXT_STRINGS: HelpTextConfig[] = [
  {
    name: "count",
    structure: "Count",
    category: "aggregation",
    description: () => t`Returns the count of rows in the selected data.`,
  },
  {
    name: "cum-count",
    structure: "CumulativeCount",
    category: "aggregation",
    description: () => t`The additive total of rows across a breakout.`,
  },
  {
    name: "sum",
    structure: "Sum",
    category: "window",
    description: () => t`Adds up all the values of the column.`,
    args: [
      {
        name: t`column`,
        description: t`The column or number to sum.`,
        example: ["dimension", t`Subtotal`],
      },
    ],
  },
  {
    name: "cum-sum",
    structure: "CumulativeSum",
    category: "window",
    description: () => t`The rolling sum of a column across a breakout.`,
    args: [
      {
        name: t`column`,
        description: t`The column or number to sum.`,
        example: ["dimension", t`Subtotal`],
      },
    ],
  },
  {
    name: "distinct",
    structure: "Distinct",
    category: "aggregation",
    description: () => t`The number of distinct values in this column.`,
    args: [
      {
        name: t`column`,
        description: t`The column whose distinct values to count.`,
        example: ["dimension", t`Last Name`],
      },
    ],
  },
  {
    name: "distinct-where",
    structure: "DistinctIf",
    description: () =>
      t`The count of distinct values in this column for rows where the condition is \`true\`.`,
    category: "aggregation",
    args: [
      {
        name: t`column`,
        description: t`The column to count distinct values in.`,
        example: ["dimension", t`Customer ID`],
      },
      {
        name: t`condition`,
        description: t`Something that evaluates to \`true\` or \`false\`.`,
        example: ["=", ["dimension", t`Order Status`], "Completed"],
      },
    ],
  },
  {
    name: "stddev",
    structure: "StandardDeviation",
    category: "aggregation",
    description: () => t`Calculates the standard deviation of the column.`,
    args: [
      {
        name: t`column`,
        description: t`The numeric column to get standard deviation of.`,
        example: ["dimension", t`Population`],
      },
    ],
  },
  {
    name: "offset",
    structure: "Offset",
    category: "window",
    description: () =>
      t`Returns the value of an aggregation expression in a different row`,
    args: [
      {
        name: t`expression`,
        description: t`The value to get from a different row.`,
        example: ["sum", ["dimension", t`Total`]],
      },
      {
        name: t`rowOffset`,
        description: t`Row number relative to the current row, for example \`-1\` for the previous row or \`1\` for the next row.`,
        example: -1,
      },
    ],
  },
  {
    name: "avg",
    structure: "Average",
    category: "aggregation",
    description: () => t`Returns the average of the values in the column.`,
    args: [
      {
        name: t`column`,
        description: t`The numeric column whose values to average.`,
        example: ["dimension", t`Quantity`],
      },
    ],
  },
  {
    name: "median",
    structure: "Median",
    category: "aggregation",
    description: () => t`Returns the median of all the values of a column.`,
    args: [
      {
        name: t`column`,
        description: t`The numeric column whose values to average.`,
        example: ["dimension", t`Quantity`],
      },
    ],
  },
  {
    name: "min",
    structure: "Min",
    category: "aggregation",
    description: () => t`Returns the smallest value found in the column`,
    args: [
      {
        name: t`column`,
        description: t`The numeric column whose minimum you want to find.`,
        example: ["dimension", t`Salary`],
      },
    ],
  },
  {
    name: "max",
    structure: "Max",
    category: "aggregation",
    description: () => t`Returns the largest value found in the column.`,
    args: [
      {
        name: t`column`,
        description: t`The numeric column whose maximum you want to find.`,
        example: ["dimension", t`Age`],
      },
    ],
  },
  {
    name: "share",
    structure: "Share",
    category: "aggregation",
    description: () =>
      t`Returns the percent of rows in the data that match the condition, as a decimal.`,
    args: [
      {
        name: t`condition`,
        description: t`Something that should evaluate to \`true\` or \`false\`.`,
        example: ["=", ["dimension", t`Source`], "Google"],
      },
    ],
  },
  {
    name: "count-where",
    structure: "CountIf",
    category: "aggregation",
    description: () => t`Only counts rows where the condition is \`true\`.`,
    args: [
      {
        name: t`condition`,
        description: t`Something that should evaluate to \`true\` or \`false\`.`,
        example: [">", ["dimension", t`Subtotal`], 100],
      },
    ],
  },
  {
    name: "sum-where",
    structure: "SumIf",
    category: "aggregation",
    description: () =>
      t`Sums up the specified column only for rows where the condition is \`true\`.`,
    args: [
      {
        name: t`column`,
        description: t`The numeric column to sum.`,
        example: ["dimension", t`Subtotal`],
      },
      {
        name: t`condition`,
        description: t`Something that evaluates to \`true\` or \`false\`.`,
        example: ["=", ["dimension", t`Order Status`], "Valid"],
      },
    ],
  },
  {
    name: "var",
    structure: "Variance",
    category: "aggregation",
    description: () => t`Returns the numeric variance for a given column.`,
    args: [
      {
        name: t`column`,
        description: t`The column or number to get the variance of.`,
        example: ["dimension", t`Temperature`],
      },
    ],
  },
  {
    name: "median",
    structure: "Median",
    category: "aggregation",
    description: () => t`Returns the median value of the specified column.`,
    args: [
      {
        name: t`column`,
        description: t`The column or number to get the median of.`,
        example: ["dimension", t`Age`],
      },
    ],
  },
  {
    name: "percentile",
    structure: "Percentile",
    category: "aggregation",
    description: () =>
      t`Returns the value of the column at the percentile value.`,
    args: [
      {
        name: t`column`,
        description: t`The column or number to get the percentile of.`,
        example: ["dimension", t`Score`],
      },
      {
        name: t`percentile-value`,
        description: t`The value of the percentile.`,
        example: 0.9,
      },
    ],
  },
  {
    name: "text",
    structure: "text",
    category: "conversion",
    description: () =>
      t`Converts a number or date to text. Useful for applying text filters or joining with other columns based on text comparisons.`,
    args: [
      {
        name: t`value`,
        description: t`The number or date to convert to text.`,
        example: ["dimension", "User ID"],
      },
    ],
  },
  {
    name: "integer",
    structure: "integer",
    category: "conversion",
    description: () => t`Converts a string to an integer.`,
    args: [
      {
        name: t`value`,
        description: t`The string column to convert to integers.`,
        example: ["dimension", "User ID"],
      },
    ],
  },
  {
    name: "date",
    structure: "date",
    category: "conversion",
    description: () => t`Converts an ISO 8601 date string to a date.`,
    args: [
      {
        name: t`value`,
        description: t`The string to convert to a date.`,
        example: "2025-03-20",
      },
    ],
  },
  {
    name: "lower",
    structure: "lower",
    category: "string",
    description: () => t`Returns the string of text in all lower case.`,
    args: [
      {
        name: t`value`,
        description: t`The column with values to convert to lower case.`,
        example: ["dimension", t`Status`],
      },
    ],
  },
  {
    name: "upper",
    structure: "upper",
    category: "string",
    description: () => t`Returns the text in all upper case.`,
    args: [
      {
        name: t`value`,
        description: t`The column with values to convert to upper case.`,
        example: ["dimension", t`Status`],
      },
    ],
  },
  {
    name: "substring",
    structure: "substring",
    category: "string",
    description: () => t`Returns a portion of the supplied text.`,
    args: [
      {
        name: t`value`,
        description: t`The column or text to return a portion of.`,
        example: ["dimension", t`Title`],
      },
      {
        name: t`position`,
        description: t`The position to start copying characters. Index starts at position \`1\`.`,
        example: 1,
      },
      {
        name: t`length`,
        description: t`The number of characters to return.`,
        example: 10,
      },
    ],
    docsPage: "substring",
  },
  {
    name: "split-part",
    category: "string",
    structure: "splitPart",
    description: () =>
      t`Splits a string on a specified delimiter and returns the nth substring.`,
    args: [
      {
        name: t`text`,
        description: t`The column or text to return a portion of.`,
        example: ["dimension", t`Title`],
      },
      {
        name: t`delimiter`,
        description: t`The pattern describing where each split should occur.`,
        example: ",",
      },
      {
        name: t`position`,
        description: t`Which substring to return after the split. Index starts at position \`1\`.`,
        example: 1,
      },
    ],
  },
  {
    name: "regex-match-first",
    structure: "regexextract",
    category: "string",
    description: () =>
      t`Extracts matching substrings according to a regular expression.`,
    args: [
      {
        name: t`value`,
        description: t`The column or text to search through.`,
        example: ["dimension", t`Address`],
      },
      {
        name: t`regular_expression`,
        description: t`The regular expression to match.`,
        example: "[0-9]+",
      },
    ],
    docsPage: "regexextract",
  },
  {
    name: "concat",
    structure: "concat",
    category: "string",
    description: () => t`Combine two or more strings of text together.`,
    args: [
      {
        name: t`value1`,
        description: t`The column or text to begin with.`,
        example: ["dimension", t`Last Name`],
      },
      {
        name: t`value2`,
        description: t`This will be added to the end of \`$value1\`.`,
        example: ", ",
      },
      {
        name: "…",
        description: t`This will be added to the end of \`$value2\`, and so on.`,
        example: ["dimension", t`First Name`],
      },
    ],
    docsPage: "concat",
  },
  {
    name: "path",
    category: "string",
    structure: "path",
    description: () =>
      t`Extracts the pathname from a URL. E.g., \`${'path("https://www.example.com/path/to/page.html?key1=value)'}\` would return \`${"/path/to/page.html"}\`.`,
    args: [
      {
        name: t`url`,
        description: t`A column containing URLs`,
        example: ["dimension", t`URL`],
      },
    ],
  },
  {
    name: "replace",
    structure: "replace",
    category: "string",
    description: () => t`Replaces a part of the input text with new text.`,
    args: [
      {
        name: t`value`,
        description: t`The column or text to search through.`,
        example: ["dimension", t`Title`],
      },
      {
        name: t`find`,
        description: t`The text to find.`,
        example: t`Enormous`,
      },
      {
        name: t`replace`,
        description: t`The text to use as the replacement.`,
        example: t`Gigantic`,
      },
    ],
  },
  {
    name: "length",
    structure: "length",
    category: "string",
    description: () => t`Returns the number of characters in text.`,
    args: [
      {
        name: t`value`,
        description: t`The column or text you want to get the length of.`,
        example: ["dimension", t`Comment`],
      },
    ],
  },
  {
    name: "trim",
    structure: "trim",
    category: "string",
    description: () =>
      t`Removes leading and trailing whitespace from a string of text.`,
    args: [
      {
        name: t`value`,
        description: t`The column or text you want to trim.`,
        example: ["dimension", t`Comment`],
      },
    ],
  },
  {
    name: "rtrim",
    structure: "rTrim",
    category: "string",
    description: () => t`Removes trailing whitespace from a string of text.`,
    args: [
      {
        name: t`value`,
        description: t`The column or text you want to trim.`,
        example: ["dimension", t`Comment`],
      },
    ],
  },
  {
    name: "ltrim",
    structure: "lTrim",
    category: "string",
    description: () => t`Removes leading whitespace from a string of text.`,
    args: [
      {
        name: t`value`,
        description: t`The column or text you want to trim.`,
        example: ["dimension", t`Comment`],
      },
    ],
  },
  {
    name: "host",
    structure: "host",
    category: "string",
    description: () =>
      t`Extracts the host (domain name and TLD, eg. \`"metabase.com"\` from \`"status.metabase.com"\`) from a URL or email`,
    args: [
      {
        name: t`urlOrEmail`,
        description: t`The URL or Email column to extract the host from.`,
        example: ["dimension", t`Email`],
      },
    ],
  },
  {
    name: "domain",
    structure: "domain",
    category: "string",
    description: () =>
      t`Extracts the domain name (eg. \`"metabase"\`) from a URL or email`,
    args: [
      {
        name: t`urlOrEmail`,
        description: t`The URL or Email column to extract domain names from.`,
        example: ["dimension", t`Email`],
      },
    ],
  },
  {
    name: "subdomain",
    structure: "subdomain",
    category: "string",
    description: () =>
      t`Extracts the first subdomain (eg. \`"status"\` from \`"status.metabase.com"\`, \`""\` from \`"bbc.co.uk"\`) from a URL. Ignores \`"www"\`.`,
    args: [
      {
        name: t`url`,
        description: t`The URL column to extract the subdomain from.`,
        example: ["dimension", t`ProfileImage`],
      },
    ],
  },
  {
    name: "month-name",
    structure: "monthName",
    category: "date",
    description: () =>
      t`Returns the localized short name (eg. \`"Apr"\`) for the given month number (eg. \`4\`)`,
    args: [
      {
        name: t`monthNumber`,
        description: t`Column or expression giving the number of a month in the year, \`1\` to \`12\`.`,
        example: ["dimension", t`Birthday Month`],
      },
    ],
  },
  {
    name: "quarter-name",
    structure: "quarterName",
    category: "date",
    description: () =>
      t`Returns a string like \`"Q1"\`, given the quarter number`,
    args: [
      {
        name: t`quarterNumber`,
        description: t`Column or expression giving the number of a quarter of the year, \`1\` to \`4\`.`,
        example: ["dimension", t`Fiscal Quarter`],
      },
    ],
  },
  {
    name: "day-name",
    structure: "dayName",
    category: "date",
    description: () =>
      t`Returns the localized name of a day of the week, given the day's number.`,
    args: [
      {
        name: t`dayNumber`,
        description: t`Column or expression giving the number of a day of the week, \`1\` to \`7\`. Which day is \`1\` is defined in your localization setting; default Sunday.`,
        example: ["dimension", t`Weekday`],
      },
    ],
  },
  {
    name: "abs",
    structure: "abs",
    category: "math",
    description: () =>
      t`Returns the absolute (positive) value of the specified column.`,
    args: [
      {
        name: t`column`,
        description: t`The column or number to return absolute (positive) value of.`,
        example: ["dimension", t`Debt`],
      },
    ],
  },
  {
    name: "floor",
    structure: "floor",
    category: "math",
    description: () => t`Rounds a decimal number down.`,
    args: [
      {
        name: t`column`,
        description: t`The column or number to round down.`,
        example: ["dimension", t`Price`],
      },
    ],
  },
  {
    name: "ceil",
    structure: "ceil",
    category: "math",
    description: () => t`Rounds a decimal number up.`,
    args: [
      {
        name: t`column`,
        description: t`The column or number to round up.`,
        example: ["dimension", t`Price`],
      },
    ],
  },
  {
    name: "round",
    structure: "round",
    category: "math",
    description: () =>
      t`Rounds a decimal number either up or down to the nearest integer value.`,
    args: [
      {
        name: t`column`,
        description: t`The column or number to round to nearest integer.`,
        example: ["dimension", t`Temperature`],
      },
    ],
  },
  {
    name: "sqrt",
    structure: "sqrt",
    category: "math",
    description: () => t`Returns the square root.`,
    args: [
      {
        name: t`column`,
        description: t`The column or number to return square root value of.`,
        example: ["dimension", t`Hypotenuse`],
      },
    ],
  },
  {
    name: "power",
    structure: "power",
    category: "math",
    description: () => t`Raises a number to the power of the exponent value.`,
    args: [
      {
        name: t`column`,
        description: t`The column or number raised to the exponent.`,
        example: ["dimension", t`Length`],
      },
      {
        name: t`exponent`,
        description: t`The value of the exponent.`,
        example: 2,
      },
    ],
  },
  {
    name: "log",
    structure: "log",
    category: "math",
    description: () => t`Returns the base 10 log of the number.`,
    args: [
      {
        name: t`column`,
        description: t`The column or number to return the natural logarithm value of.`,
        example: ["dimension", t`Value`],
      },
    ],
  },
  {
    name: "datetime-diff",
    structure: "datetimeDiff",
    category: "date",
    description: () =>
      t`Get the difference between two datetime values (\`$datetime2\` minus \`$datetime1\`) using the specified unit of time.`,
    args: [
      {
        name: t`datetime1`,
        description: t`The column or expression with your datetime value.`,
        example: ["dimension", t`Created At`],
      },
      {
        name: t`datetime2`,
        description: t`The column or expression with your datetime value.`,
        example: ["dimension", t`Shipped At`],
      },
      {
        name: t`unit`,
        description: t`Choose from: ${"year"}, ${"quarter"}, ${"month"}, ${"week"}, ${"day"}, ${"hour"}, ${"minute"}, or ${"second"}.`,
        example: "month",
      },
    ],
    docsPage: "datetimediff",
  },
  {
    name: "exp",
    structure: "exp",
    category: "math",
    description: () =>
      t`Returns Euler's number, e, raised to the power of the supplied number.`,
    args: [
      {
        name: t`column`,
        description: t`The column or number to return the exponential value of.`,
        example: ["dimension", t`Interest Months`],
      },
    ],
  },
  {
    name: "contains",
    structure: "contains",
    category: "string",
    description: () =>
      t`Returns \`true\` if \`$string1\` contains \`$string2\` within it (or \`$string3\`, etc. if specified).`,
    args: [
      {
        name: t`string1`,
        description: t`The column or text to check.`,
        example: ["dimension", t`Title`],
      },
      {
        name: t`string2`,
        description: t`The string of text to look for.`,
        example: t`Small`,
      },
      {
        name: "…",
        description: t`You can add more values to look for.`,
        example: t`Medium`,
      },
      {
        name: "caseSensitivity",
        description: t`Optional. Set to \`"case-insensitive"\` to perform a case-insensitive match.`,
        example: "case-insensitive",
        template: '"case-insensitive"',
      },
    ],
  },
  {
    name: "does-not-contain",
    structure: "doesNotContain",
    category: "string",
    description: () =>
      t`Returns \`true\` if \`$string1\` does not contain \`$string2\` within it (and \`$string3\`, etc. if specified).`,
    args: [
      {
        name: t`string1`,
        description: t`The column or text to check.`,
        example: ["dimension", t`Title`],
      },
      {
        name: t`string2`,
        description: t`The string of text to look for.`,
        example: t`Small`,
      },
      {
        name: "…",
        description: t`You can add more values to look for.`,
        example: t`Medium`,
      },
      {
        name: "caseSensitivity",
        description: t`Optional. Set to \`"case-insensitive"\` to perform a case-insensitive match.`,
        example: "case-insensitive",
        template: '"case-insensitive"',
      },
    ],
  },
  {
    name: "starts-with",
    structure: "startsWith",
    category: "string",
    description: () =>
      t`Returns true if the beginning of the \`$string1\` matches the \`$string2\` (or \`$string3\`, etc. if specified).`,
    args: [
      {
        name: t`string1`,
        description: t`The column or text to check.`,
        example: ["dimension", t`Title`],
      },
      {
        name: t`string2`,
        description: t`The string of text to look for.`,
        example: t`Small`,
      },
      {
        name: "…",
        description: t`You can add more values to look for.`,
        example: t`Medium`,
      },
      {
        name: "caseSensitivity",
        description: t`Optional. Set to \`"case-insensitive"\` to perform a case-insensitive match.`,
        example: "case-insensitive",
        template: '"case-insensitive"',
      },
    ],
  },
  {
    name: "ends-with",
    structure: "endsWith",
    category: "string",
    description: () =>
      t`Returns true if the end of the \`$string1\` matches the \`$string2\` (or \`$string3\`, etc. if specified).`,
    args: [
      {
        name: t`string1`,
        description: t`The column or text to check.`,
        example: ["dimension", t`Title`],
      },
      {
        name: t`string2`,
        description: t`The string of text to look for.`,
        example: t`Small`,
      },
      {
        name: "…",
        description: t`You can add more values to look for.`,
        example: t`Medium`,
      },
      {
        name: "caseSensitivity",
        description: t`Optional. Set to \`"case-insensitive"\` to perform a case-insensitive match.`,
        example: "case-insensitive",
        template: '"case-insensitive"',
      },
    ],
  },
  {
    name: "between",
    category: "logical",
    structure: "between",
    description: () =>
      t`Checks a date or number column's values to see if they're within the specified range.`,
    args: [
      {
        name: t`column`,
        description: t`The date or numeric column that should be within the start and end values.`,
        example: ["dimension", t`Created At`],
      },
      {
        name: t`start`,
        description: t`The beginning of the range.`,
        example: "2019-01-01",
      },
      {
        name: t`end`,
        description: t`The end of the range.`,
        example: "2022-12-31",
      },
    ],
  },
  {
    name: "interval",
    structure: "timeSpan",
    category: "date",
    description: () => t`Gets a time interval of specified length`,
    args: [
      {
        name: t`number`,
        description: t`Period of interval, where negative values are back in time.`,
        example: 7,
      },
      {
        name: t`unit`,
        description: t`Type of interval like ${"day"}, ${"month"}, ${"year"}.`,
        example: "day",
      },
    ],
  },
  {
    name: "time-interval",
    structure: "interval",
    category: "date",
    description: () =>
      t`Checks a date column's values to see if they're within the relative range.`,
    args: [
      {
        name: t`column`,
        description: t`The date column to return interval of.`,
        example: ["dimension", t`Created At`],
      },
      {
        name: t`number`,
        description: t`Period of interval, where negative values are back in time.`,
        example: "-1",
      },
      {
        name: t`unit`,
        description: t`Type of interval like ${"day"}, ${"month"}, ${"year"}.`,
        example: "month",
      },
    ],
  },
  {
    name: "relative-time-interval",
    structure: "intervalStartingFrom",
    category: "date",
    description: () =>
      t`Returns true if a column's value falls within an interval, starting from an initial, offsetting interval.`,
    args: [
      {
        name: t`column`,
        description: t`The date column to check.`,
        example: ["dimension", t`Created At`],
      },
      {
        name: t`value`,
        description: t`Period of the interval, where negative numbers go back in time.`,
        example: -20,
      },
      {
        name: t`unit`,
        description: t`Type of interval like ${"day"}, ${"month"}, ${"year"}.`,
        example: "month",
      },
      {
        name: t`offsetValue`,
        description: t`The initial interval period to start from, where negative values are back in time.`,
        example: -10,
      },
      {
        name: t`offsetUnit`,
        description: t`Type of interval like ${"day"}, ${"month"}, ${"year"}.`,
        example: "year",
      },
    ],
  },
  {
    name: "relative-datetime",
    structure: "relativeDateTime",
    category: "date",
    description: () => t`Gets a timestamp relative to the current time`,
    args: [
      {
        name: t`number`,
        description: t`Period of interval, where negative values are back in time.`,
        example: -30,
      },
      {
        name: t`unit`,
        description: t`Type of interval like ${"day"}, ${"month"}, ${"year"}.`,
        example: "day",
      },
    ],
  },
  {
    name: "is-null",
    structure: "isNull",
    category: "logical",
    description: () => t`Checks if a column is null`,
    args: [
      {
        name: t`column`,
        description: t`The column to check.`,
        example: ["dimension", t`Discount`],
      },
    ],
    docsPage: "isnull",
  },
  {
    name: "not-null",
    structure: "notNull",
    category: "logical",
    description: () => t`Checks if a column is not null`,
    args: [
      {
        name: t`column`,
        description: t`The column to check.`,
        example: ["dimension", t`Discount`],
      },
    ],
  },
  {
    name: "is-empty",
    structure: "isEmpty",
    category: "string",
    description: () => t`Checks if a column is empty`,
    args: [
      {
        name: t`column`,
        description: t`The column to check.`,
        example: ["dimension", t`Name`],
      },
    ],
    docsPage: "isempty",
  },
  {
    name: "not-empty",
    structure: "notEmpty",
    category: "string",
    description: () => t`Checks if a column is not empty`,
    args: [
      {
        name: t`column`,
        description: t`The column to check.`,
        example: ["dimension", t`Name`],
      },
    ],
  },
  {
    name: "coalesce",
    category: "logical",
    structure: "coalesce",
    description: () =>
      t`Looks at the values in each argument in order and returns the first non-null value for each row.`,
    args: [
      {
        name: t`value1`,
        description: t`The column or value to return.`,
        example: ["dimension", t`Comments`],
      },
      {
        name: t`value2`,
        description: t`If \`$value1\` is empty, \`$value2\` gets returned if its not empty.`,
        example: ["dimension", t`Notes`],
      },
      {
        name: "…",
        description: t`If \`$value1\` is empty, and \`$value2\` is empty, the next non-empty one will be returned.`,
        example: t`No comments`,
      },
    ],
    docsPage: "coalesce",
  },
  {
    name: "case",
    category: "logical",
    structure: "case",
    description: () =>
      t`Alias for \`if()\`. Tests an expression against a list of cases and returns the corresponding value of the first matching case, with an optional default value if nothing else is met.`,
    args: [
      {
        name: t`condition`,
        description: t`Something that should evaluate to \`true\` or \`false\`.`,
        example: [">", ["dimension", t`Weight`], 200],
      },
      {
        name: t`output`,
        description: t`The value that will be returned if the preceding condition is \`true\`.`,
        example: t`Large`,
      },
      {
        name: "…",
        description: t`You can add more conditions to test.`,
        example: [
          "args",
          [[">", ["dimension", t`Weight`], 150], t`Medium`, t`Small`],
        ],
      },
    ],
    docsPage: "case",
  },
  {
    name: "if",
    structure: "if",
    category: "logical",
    description: () =>
      t`Alias for \`case()\`. Tests an expression against a list of cases and returns the corresponding value of the first matching case, with an optional default value if nothing else is met.`,
    args: [
      {
        name: t`condition`,
        description: t`Something that should evaluate to \`true\` or \`false\`.`,
        example: [">", ["dimension", t`Weight`], 200],
      },
      {
        name: t`output`,
        description: t`The value that will be returned if the preceding condition is \`true\`.`,
        example: t`Large`,
      },
      {
        name: "…",
        description: t`You can add more conditions to test.`,
        example: [
          "args",
          [[">", ["dimension", t`Weight`], 150], t`Medium`, t`Small`],
        ],
      },
    ],
  },
  {
    name: "in",
    structure: "in",
    category: "logical",
    description: () =>
      t`Returns true if \`value1\` equals \`$value2\` (or \`$value3\`, etc. if specified).`,
    args: [
      {
        name: t`value1`,
        description: t`The column or value to check.`,
        example: ["dimension", t`Category`],
      },
      {
        name: t`value2`,
        description: t`The column or value to look for.`,
        example: "Widget",
      },
      {
        name: "…",
        description: t`You can add more values to look for.`,
        example: "Gadget",
      },
    ],
  },
  {
    name: "not-in",
    structure: "notIn",
    category: "logical",
    description: () =>
      t`Returns true if \`$value1\` doesn't equal \`$value2\` (and \`$value3\`, etc. if specified).`,
    args: [
      {
        name: t`value1`,
        description: t`The column or value to check.`,
        example: ["dimension", t`Category`],
      },
      {
        name: t`value2`,
        description: t`The column or value to look for.`,
        example: "Widget",
      },
      {
        name: "…",
        description: t`You can add more values to look for.`,
        example: "Gadget",
      },
    ],
  },
  {
    name: "get-year",
    structure: "year",
    category: "date",
    description: () =>
      t`Takes a datetime and returns an integer with the number of the year.`,
    args: [
      {
        name: t`column`,
        description: t`The datetime column.`,
        example: ["dimension", t`Created At`],
      },
    ],
  },
  {
    name: "get-quarter",
    structure: "quarter",
    category: "date",
    description: () =>
      t`Takes a datetime and returns an integer (\`1\`-\`4\`) with the number of the quarter in the year.`,
    args: [
      {
        name: t`column`,
        description: t`The datetime column.`,
        example: ["dimension", t`Created At`],
      },
    ],
  },
  {
    name: "get-month",
    structure: "month",
    category: "date",
    description: () =>
      t`Takes a datetime and returns an integer (\`1\`-\`12\`) with the number of the month in the year.`,
    args: [
      {
        name: t`column`,
        description: t`The datetime column.`,
        example: ["dimension", t`Created At`],
      },
    ],
  },
  {
    name: "get-week",
    structure: "week",
    category: "date",
    description: () => t`Extracts the week of the year as an integer.`,
    args: [
      {
        name: t`column`,
        description: t`The name of the column with your date or datetime value.`,
        example: ["dimension", t`Created At`],
      },
      {
        name: t`mode`,
        // TODO: This is the only place that's not easy to replace the application name.
        // eslint-disable-next-line no-literal-metabase-strings -- Hard to replace the application name because it's not a React component
        description: t`Optional. The default is \`"ISO"\`.
- ISO: Week 1 starts on the Monday before the first Thursday of January.
- US: Week 1 starts on Jan 1. All other weeks start on Sunday.
- Instance: Week 1 starts on Jan 1. All other weeks start on the day defined in your Metabase localization settings.
`,
        example: "iso",
      },
    ],
  },
  {
    name: "get-day",
    structure: "day",
    category: "date",
    description: () =>
      t`Takes a datetime and returns an integer (\`1\`-\`31\`) with the number of the day of the month.`,
    args: [
      {
        name: t`column`,
        description: t`The datetime column.`,
        example: ["dimension", t`Created At`],
      },
    ],
  },
  {
    name: "get-day-of-week",
    structure: "weekday",
    category: "date",
    description: () =>
      t`Takes a datetime and returns an integer (\`1\`-\`7\`) with the number of the day of the week. Which day is \`1\` is defined in your localization settings.`,
    args: [
      {
        name: t`column`,
        description: t`The datetime column.`,
        example: ["dimension", t`Created At`],
      },
    ],
  },
  {
    name: "get-hour",
    structure: "hour",
    category: "date",
    description: () =>
      t`Takes a datetime and returns an integer (\`0\`-\`23\`) with the number of the hour. No AM/PM.`,
    args: [
      {
        name: t`column`,
        description: t`The datetime column.`,
        example: ["dimension", t`Created At`],
      },
    ],
  },
  {
    name: "get-minute",
    structure: "minute",
    category: "date",
    description: () =>
      t`Takes a datetime and returns an integer (\`0\`-\`59\`) with the number of the minute in the hour.`,
    args: [
      {
        name: t`column`,
        description: t`The datetime column.`,
        example: ["dimension", t`Created At`],
      },
    ],
  },
  {
    name: "get-second",
    structure: "second",
    category: "date",
    description: () =>
      t`Takes a datetime and returns an integer (\`0\`-\`59\`) with the number of the seconds in the minute.`,
    args: [
      {
        name: t`column`,
        description: t`The datetime column.`,
        example: ["dimension", t`Created At`],
      },
    ],
  },
  {
    name: "datetime-add",
    structure: "datetimeAdd",
    category: "date",
    description: () => t`Adds some units of time to a date or timestamp value.`,
    args: [
      {
        name: t`column`,
        description: t`The column with your date or timestamp values.`,
        example: ["dimension", t`Created At`],
      },
      {
        name: t`amount`,
        description: t`The number of units to be added.`,
        example: 1,
      },
      {
        name: t`unit`,
        description: t`Choose from: ${"year"}, ${"quarter"}, ${"month"}, ${"week"}, ${"day"}, ${"hour"}, ${"minute"}, ${"second"}, or ${"millisecond"}.`,
        example: "month",
      },
    ],
    docsPage: "datetimeadd",
  },
  {
    name: "datetime-subtract",
    structure: "datetimeSubtract",
    category: "date",
    description: () =>
      t`Subtracts some units of time to a date or timestamp value.`,
    args: [
      {
        name: t`column`,
        description: t`The column with your date or timestamp values.`,
        example: ["dimension", t`Created At`],
      },
      {
        name: t`amount`,
        description: t`The number of units to be subtracted.`,
        example: 1,
      },
      {
        name: t`unit`,
        description: t`Choose from: ${"year"}, ${"quarter"}, ${"month"}, ${"week"}, ${"day"}, ${"hour"}, ${"minute"}, ${"second"}, or ${"millisecond"}.`,
        example: "month",
      },
    ],
    docsPage: "datetimesubtract",
  },
  {
    name: "now",
    structure: "now",
    category: "date",
    description: getDescriptionForNow,
  },
  {
    name: "convert-timezone",
    structure: "convertTimezone",
    category: "date",
    description: () => t`Convert timezone of a date or timestamp column.
We support tz database time zone names.`,
    args: [
      {
        name: t`column`,
        description: t`The column with your date or timestamp values.`,
        example: ["dimension", t`Created At`],
      },
      {
        name: t`target`,
        description: t`The timezone you want to assign to your column.`,
        example: "Asia/Ho_Chi_Minh",
      },
      {
        name: t`source`,
        description: t`The current time zone. Only required for timestamps with no time zone.`,
        example: "UTC",
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
  const helperTextConfig = HELPER_TEXT_STRINGS.find((h) => h.name === name);

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

function isArgsExpression(x: unknown): x is ["args", Expression[]] {
  return Array.isArray(x) && x[0] === "args";
}

/**
 * Build the expression example as a Lib.ExpressionParts manually.
 * This is necessary because we don't have a query to refer to in the examples.
 *
 * TODO: can we approach this differently?
 */
const getHelpExample = ({
  name,
  args = [],
}: HelpTextConfig): Lib.ExpressionParts => {
  const parameters: (Lib.ExpressionArg | Lib.ExpressionParts)[] = [];

  for (const arg of args) {
    if (isArgsExpression(arg.example)) {
      const [_op, args] = arg.example;
      parameters.push(...args.map(toExpressionParts));
    } else {
      parameters.push(toExpressionParts(arg.example));
    }
  }

  return {
    operator: name as Lib.ExpressionOperator,
    options: {},
    args: parameters,
  };
};

function toExpressionParts(
  value: Expression,
): Lib.ExpressionParts | Lib.ExpressionArg {
  if (isLiteral(value)) {
    return value;
  }

  if (!Array.isArray(value)) {
    throw new Error("Expression example: expected array");
  }

  const [operator, ...args] = value;
  return {
    operator: operator as Lib.ExpressionOperator,
    options: {},
    // @ts-expect-error: we don't handle all the cases here.
    args: args.map(toExpressionParts),
  };
}

export const getHelpDocsUrl = ({ docsPage }: HelpText): string => {
  return docsPage
    ? `questions/query-builder/expressions/${docsPage}`
    : "questions/query-builder/expressions";
};

export const getFunctionByStructure = (structure: string) =>
  HELPER_TEXT_STRINGS.find(
    (h) => h.structure.toLowerCase() === structure.toLowerCase(),
  )?.name;
