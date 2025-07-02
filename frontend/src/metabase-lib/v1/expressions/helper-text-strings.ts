import moment from "moment-timezone"; // eslint-disable-line no-restricted-imports -- deprecated usage
import { t } from "ttag";

import type {
  HelpText,
  HelpTextConfig,
} from "metabase-lib/v1/expressions/types";
import type Database from "metabase-lib/v1/metadata/Database";

import { formatIdentifier, formatStringLiteral } from "./";

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
        get name() {
          return t`column`;
        },
        get description() {
          return t`The column or number to sum.`;
        },
        // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
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
        get name() {
          return t`column`;
        },
        get description() {
          return t`The column or number to sum.`;
        },
        // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
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
        get name() {
          return t`column`;
        },
        get description() {
          return t`The column whose distinct values to count.`;
        },
        // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
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
        get name() {
          return t`column`;
        },
        get description() {
          return t`The numeric column to get standard deviation of.`;
        },
        // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
        example: formatIdentifier(t`Population`),
      },
    ],
  },
  {
    name: "offset",
    structure: "Offset",
    description: () =>
      t`Returns the value of an aggregation expression in a different row`,
    args: [
      {
        get name() {
          return t`expression`;
        },
        get description() {
          return t`The value to get from a different row.`;
        },
        // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
        example: `Sum(${formatIdentifier(t`Total`)})`,
      },
      {
        get name() {
          return t`rowOffset`;
        },
        get description() {
          return t`Row number relative to the current row, for example -1 for the previous row or 1 for the next row.`;
        },
        example: "-1",
      },
    ],
  },
  {
    name: "avg",
    structure: "Average",
    description: () => t`Returns the average of the values in the column.`,
    args: [
      {
        get name() {
          return t`column`;
        },
        get description() {
          return t`The numeric column whose values to average.`;
        },
        // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
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
        get name() {
          return t`column`;
        },
        get description() {
          return t`The numeric column whose values to average.`;
        },
        // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
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
        get name() {
          return t`column`;
        },
        get description() {
          return t`The numeric column whose minimum you want to find.`;
        },
        // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
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
        get name() {
          return t`column`;
        },
        get description() {
          return t`The numeric column whose maximum you want to find.`;
        },
        // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
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
        get name() {
          return t`condition`;
        },
        get description() {
          return t`Something that should evaluate to true or false.`;
        },
        // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
        example: `${formatIdentifier(t`Source`)} = ${formatStringLiteral(
          // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
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
        get name() {
          return t`condition`;
        },
        get description() {
          return t`Something that should evaluate to true or false.`;
        },
        // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
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
        get name() {
          return t`column`;
        },
        get description() {
          return t`The numeric column to sum.`;
        },
        // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
        example: formatIdentifier(t`Subtotal`),
      },
      {
        get name() {
          return t`condition`;
        },
        get description() {
          return t`Something that should evaluate to true or false.`;
        },
        // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
        example: `${formatIdentifier(t`Order Status`)} = ${formatStringLiteral(
          // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
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
        get name() {
          return t`column`;
        },
        get description() {
          return t`The column or number to get the variance of.`;
        },
        // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
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
        get name() {
          return t`column`;
        },
        get description() {
          return t`The column or number to get the median of.`;
        },
        // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
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
        get name() {
          return t`column`;
        },
        get description() {
          return t`The column or number to get the percentile of.`;
        },
        // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
        example: formatIdentifier(t`Score`),
      },
      {
        get name() {
          return t`percentile-value`;
        },
        get description() {
          return t`The value of the percentile.`;
        },
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
        get name() {
          return t`text`;
        },
        get description() {
          return t`The column with values to convert to lower case.`;
        },
        // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
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
        get name() {
          return t`text`;
        },
        get description() {
          return t`The column with values to convert to upper case.`;
        },
        // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
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
        get name() {
          return t`text`;
        },
        get description() {
          return t`The column or text to return a portion of.`;
        },
        // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
        example: formatIdentifier(t`Title`),
      },
      {
        get name() {
          return t`position`;
        },
        get description() {
          return t`The position to start copying characters. Index starts at position 1.`;
        },
        example: "1",
      },
      {
        get name() {
          return t`length`;
        },
        get description() {
          return t`The number of characters to return.`;
        },
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
        get name() {
          return t`text`;
        },
        get description() {
          return t`The column or text to search through.`;
        },
        // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
        example: formatIdentifier(t`Address`),
      },
      {
        get name() {
          return t`regular_expression`;
        },
        get description() {
          return t`The regular expression to match.`;
        },
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
        get name() {
          return t`value1`;
        },
        get description() {
          return t`The column or text to begin with.`;
        },
        // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
        example: formatIdentifier(t`Last Name`),
      },
      {
        get name() {
          return t`value2`;
        },
        get description() {
          return t`This will be added to the end of value1.`;
        },
        example: formatStringLiteral(", "),
      },
      {
        name: "…",
        get description() {
          return t`This will be added to the end of value2, and so on.`;
        },
        // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
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
        get name() {
          return t`text`;
        },
        get description() {
          return t`The column or text to search through.`;
        },
        // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
        example: formatIdentifier(t`Title`),
      },
      {
        get name() {
          return t`find`;
        },
        get description() {
          return t`The text to find.`;
        },
        // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
        example: formatStringLiteral(t`Enormous`),
      },
      {
        get name() {
          return t`replace`;
        },
        get description() {
          return t`The text to use as the replacement.`;
        },
        // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
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
        get name() {
          return t`text`;
        },
        get description() {
          return t`The column or text you want to get the length of.`;
        },
        // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
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
        get name() {
          return t`text`;
        },
        get description() {
          return t`The column or text you want to trim.`;
        },
        // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
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
        get name() {
          return t`text`;
        },
        get description() {
          return t`The column or text you want to trim.`;
        },
        // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
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
        get name() {
          return t`text`;
        },
        get description() {
          return t`The column or text you want to trim.`;
        },
        // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
        example: formatIdentifier(t`Comment`),
      },
    ],
  },
  {
    name: "host",
    structure: "host",
    description: () =>
      t`Extracts the host (domain name and TLD, eg. "metabase.com" from "status.metabase.com") from a URL or email`,
    args: [
      {
        get name() {
          return t`urlOrEmail`;
        },
        get description() {
          return t`The URL or Email column to extract the host from.`;
        },
        // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
        example: formatIdentifier(t`Email`),
      },
    ],
  },
  {
    name: "domain",
    structure: "domain",
    description: () =>
      t`Extracts the domain name (eg. "metabase") from a URL or email`,
    args: [
      {
        get name() {
          return t`urlOrEmail`;
        },
        get description() {
          return t`The URL or Email column to extract domain names from.`;
        },
        // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
        example: formatIdentifier(t`Email`),
      },
    ],
  },
  {
    name: "subdomain",
    structure: "subdomain",
    description: () =>
      t`Extracts the first subdomain (eg. "status" from "status.metabase.com", "" from "bbc.co.uk") from a URL. Ignores "www".`,
    args: [
      {
        get name() {
          return t`url`;
        },
        get description() {
          return t`The URL column to extract the subdomain from.`;
        },
        // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
        example: formatIdentifier(t`ProfileImage`),
      },
    ],
  },
  {
    name: "month-name",
    structure: "monthName",
    description: () =>
      t`Returns the localized short name ("Apr") for the given month number (4)`,
    args: [
      {
        get name() {
          return t`monthNumber`;
        },
        get description() {
          return t`Column or expression giving the number of a month in the year, 1 to 12.`;
        },
        // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
        example: formatIdentifier(t`Birthday Month`),
      },
    ],
  },
  {
    name: "quarter-name",
    structure: "quarterName",
    description: () => t`Returns a string like "Q1", given the quarter number`,
    args: [
      {
        get name() {
          return t`quarterNumber`;
        },
        get description() {
          return t`Column or expression giving the number of a quarter of the year, 1 to 4.`;
        },
        // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
        example: formatIdentifier(t`Fiscal Quarter`),
      },
    ],
  },
  {
    name: "day-name",
    structure: "dayName",
    description: () =>
      t`Returns the localized name of a day of the week, given the day's number.`,
    args: [
      {
        get name() {
          return t`dayNumber`;
        },
        get description() {
          return t`Column or expression giving the number of a day of the week, 1 to 7. Which day is 1 is defined in your localization setting; default Sunday.`;
        },
        // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
        example: formatIdentifier(t`Weekday`),
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
        get name() {
          return t`column`;
        },
        get description() {
          return t`The column or number to return absolute (positive) value of.`;
        },
        // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
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
        get name() {
          return t`column`;
        },
        get description() {
          return t`The column or number to round down.`;
        },
        // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
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
        get name() {
          return t`column`;
        },
        get description() {
          return t`The column or number to round up.`;
        },
        // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
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
        get name() {
          return t`column`;
        },
        get description() {
          return t`The column or number to round to nearest integer.`;
        },
        // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
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
        get name() {
          return t`column`;
        },
        get description() {
          return t`The column or number to return square root value of.`;
        },
        // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
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
        get name() {
          return t`column`;
        },
        get description() {
          return t`The column or number raised to the exponent.`;
        },
        // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
        example: formatIdentifier(t`Length`),
      },
      {
        get name() {
          return t`exponent`;
        },
        get description() {
          return t`The value of the exponent.`;
        },
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
        get name() {
          return t`column`;
        },
        get description() {
          return t`The column or number to return the natural logarithm value of.`;
        },
        // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
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
        get name() {
          return t`datetime1`;
        },
        get description() {
          return t`The column or expression with your datetime value.`;
        },
        // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
        example: formatIdentifier(t`Created At`),
      },
      {
        get name() {
          return t`datetime2`;
        },
        get description() {
          return t`The column or expression with your datetime value.`;
        },
        // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
        example: formatIdentifier(t`Shipped At`),
      },
      {
        get name() {
          return t`unit`;
        },
        get description() {
          return t`Choose from: ${"year"}, ${"quarter"}, ${"month"}, ${"week"}, ${"day"}, ${"hour"}, ${"minute"}, or ${"second"}.`;
        },
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
        get name() {
          return t`column`;
        },
        get description() {
          return t`The column or number to return the exponential value of.`;
        },
        // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
        example: formatIdentifier(t`Interest Months`),
      },
    ],
  },
  {
    name: "contains",
    structure: "contains",
    description: () =>
      t`Returns true if string1 contains string2 within it (or string3, etc. if specified).`,
    args: [
      {
        get name() {
          return t`string1`;
        },
        get description() {
          return t`The column or text to check.`;
        },
        // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
        example: formatIdentifier(t`Title`),
      },
      {
        get name() {
          return t`string2`;
        },
        get description() {
          return t`The string of text to look for.`;
        },
        // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
        example: formatStringLiteral(t`Small`),
      },
      {
        name: "…",
        get description() {
          return t`You can add more values to look for.`;
        },
        // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
        example: formatStringLiteral(t`Medium`),
      },
      {
        name: "case-insensitive",
        get description() {
          return t`Optional. To perform a case-insensitive match.`;
        },
        example: formatStringLiteral("case-insensitive"),
      },
    ],
  },
  {
    name: "does-not-contain",
    structure: "doesNotContain",
    description: () =>
      t`Returns true if string1 does not contain string2 within it (and string3, etc. if specified).`,
    args: [
      {
        get name() {
          return t`string1`;
        },
        get description() {
          return t`The column or text to check.`;
        },
        // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
        example: formatIdentifier(t`Title`),
      },
      {
        get name() {
          return t`string2`;
        },
        get description() {
          return t`The string of text to look for.`;
        },
        // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
        example: formatStringLiteral(t`Small`),
      },
      {
        name: "…",
        get description() {
          return t`You can add more values to look for.`;
        },
        // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
        example: formatStringLiteral(t`Medium`),
      },
      {
        name: "case-insensitive",
        get description() {
          return t`Optional. To perform a case-insensitive match.`;
        },
        example: formatStringLiteral("case-insensitive"),
      },
    ],
  },
  {
    name: "starts-with",
    structure: "startsWith",
    description: () =>
      t`Returns true if the beginning of the string1 matches the string2 (or string3, etc. if specified).`,
    args: [
      {
        get name() {
          return t`string1`;
        },
        get description() {
          return t`The column or text to check.`;
        },
        // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
        example: formatIdentifier(t`Title`),
      },
      {
        get name() {
          return t`string2`;
        },
        get description() {
          return t`The string of text to look for.`;
        },
        // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
        example: formatStringLiteral(t`Small`),
      },
      {
        name: "…",
        get description() {
          return t`You can add more values to look for.`;
        },
        // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
        example: formatStringLiteral(t`Medium`),
      },
      {
        name: "case-insensitive",
        get description() {
          return t`Optional. To perform a case-insensitive match.`;
        },
        example: formatStringLiteral("case-insensitive"),
      },
    ],
  },
  {
    name: "ends-with",
    structure: "endsWith",
    description: () =>
      t`Returns true if the end of the string1 matches the string2 (or string3, etc. if specified).`,
    args: [
      {
        get name() {
          return t`string1`;
        },
        get description() {
          return t`The column or text to check.`;
        },
        // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
        example: formatIdentifier(t`Title`),
      },
      {
        get name() {
          return t`string2`;
        },
        get description() {
          return t`The string of text to look for.`;
        },
        // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
        example: formatStringLiteral(t`Small`),
      },
      {
        name: "…",
        get description() {
          return t`You can add more values to look for.`;
        },
        // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
        example: formatStringLiteral(t`Medium`),
      },
      {
        name: "case-insensitive",
        get description() {
          return t`Optional. To perform a case-insensitive match.`;
        },
        example: formatStringLiteral("case-insensitive"),
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
        get name() {
          return t`column`;
        },
        get description() {
          return t`The date or numeric column that should be within the start and end values.`;
        },
        // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
        example: formatIdentifier(t`Created At`),
      },
      {
        get name() {
          return t`start`;
        },
        get description() {
          return t`The beginning of the range.`;
        },
        example: formatStringLiteral("2019-01-01"),
      },
      {
        get name() {
          return t`end`;
        },
        get description() {
          return t`The end of the range.`;
        },
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
        get name() {
          return t`number`;
        },
        get description() {
          return t`Period of interval, where negative values are back in time.`;
        },
        example: "7",
      },
      {
        get name() {
          return t`text`;
        },
        get description() {
          return t`Type of interval like ${"day"}, ${"month"}, ${"year"}.`;
        },
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
        get name() {
          return t`column`;
        },
        get description() {
          return t`The date column to return interval of.`;
        },
        // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
        example: formatIdentifier(t`Created At`),
      },
      {
        get name() {
          return t`number`;
        },
        get description() {
          return t`Period of interval, where negative values are back in time.`;
        },
        example: "-1",
      },
      {
        get name() {
          return t`text`;
        },
        get description() {
          return t`Type of interval like ${"day"}, ${"month"}, ${"year"}.`;
        },
        example: formatStringLiteral("month"),
      },
    ],
  },
  {
    name: "relative-time-interval",
    structure: "intervalStartingFrom",
    description: () =>
      t`Returns true if a column's value falls within an interval, starting from an initial, offsetting interval.`,
    args: [
      {
        get name() {
          return t`column`;
        },
        get description() {
          return t`The date column to check.`;
        },
        // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
        example: formatIdentifier(t`Created At`),
      },
      {
        get name() {
          return t`value`;
        },
        get description() {
          return t`Period of the interval, where negative numbers go back in time.`;
        },
        example: "-20",
      },
      {
        get name() {
          return t`unit`;
        },
        get description() {
          return t`Type of interval like ${"day"}, ${"month"}, ${"year"}.`;
        },
        example: formatStringLiteral("month"),
      },
      {
        get name() {
          return t`offsetValue`;
        },
        get description() {
          return t`The initial interval period to start from, where negative values are back in time.`;
        },
        example: "-10",
      },
      {
        get name() {
          return t`offsetUnit`;
        },
        get description() {
          return t`Type of interval like ${"day"}, ${"month"}, ${"year"}.`;
        },
        example: formatStringLiteral("year"),
      },
    ],
  },
  {
    name: "relative-datetime",
    structure: "relativeDateTime",
    description: () => t`Gets a timestamp relative to the current time`,
    args: [
      {
        get name() {
          return t`number`;
        },
        get description() {
          return t`Period of interval, where negative values are back in time.`;
        },
        example: "-30",
      },
      {
        get name() {
          return t`text`;
        },
        get description() {
          return t`Type of interval like ${"day"}, ${"month"}, ${"year"}.`;
        },
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
        get name() {
          return t`column`;
        },
        get description() {
          return t`The column to check.`;
        },
        // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
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
        get name() {
          return t`column`;
        },
        get description() {
          return t`The column to check.`;
        },
        // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
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
        get name() {
          return t`column`;
        },
        get description() {
          return t`The column to check.`;
        },
        // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
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
        get name() {
          return t`column`;
        },
        get description() {
          return t`The column to check.`;
        },
        // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
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
        get name() {
          return t`value1`;
        },
        get description() {
          return t`The column or value to return.`;
        },
        // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
        example: formatIdentifier(t`Comments`),
      },
      {
        get name() {
          return t`value2`;
        },
        get description() {
          return t`If value1 is empty, value2 gets returned if its not empty.`;
        },
        // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
        example: formatIdentifier(t`Notes`),
      },
      {
        name: "…",
        get description() {
          return t`If value1 is empty, and value2 is empty, the next non-empty one will be returned.`;
        },
        // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
        example: formatStringLiteral(t`No comments`),
      },
    ],
    docsPage: "coalesce",
  },
  {
    name: "case",
    structure: "case",
    description: () =>
      t`Alias for if(). Tests an expression against a list of cases and returns the corresponding value of the first matching case, with an optional default value if nothing else is met.`,
    args: [
      {
        get name() {
          return t`condition`;
        },
        get description() {
          return t`Something that should evaluate to true or false.`;
        },
        // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
        example: `${formatIdentifier(t`Weight`)} > 200`,
      },
      {
        get name() {
          return t`output`;
        },
        get description() {
          return t`The value that will be returned if the preceding condition is true.`;
        },
        // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
        example: formatStringLiteral(t`Large`),
      },
      {
        name: "…",
        get description() {
          return t`You can add more conditions to test.`;
        },
        // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
        example: `${formatIdentifier(t`Weight`)} > 150, ${formatStringLiteral(
          // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
          t`Medium`,
          // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
        )}, ${formatStringLiteral(t`Small`)}`,
      },
    ],
    docsPage: "case",
  },
  {
    name: "if",
    structure: "if",
    description: () =>
      t`Alias for case(). Tests an expression against a list of cases and returns the corresponding value of the first matching case, with an optional default value if nothing else is met.`,
    args: [
      {
        get name() {
          return t`condition`;
        },
        get description() {
          return t`Something that should evaluate to true or false.`;
        },
        // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
        example: `${formatIdentifier(t`Weight`)} > 200`,
      },
      {
        get name() {
          return t`output`;
        },
        get description() {
          return t`The value that will be returned if the preceding condition is true.`;
        },
        // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
        example: formatStringLiteral(t`Large`),
      },
      {
        name: "…",
        get description() {
          return t`You can add more conditions to test.`;
        },
        // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
        example: `${formatIdentifier(t`Weight`)} > 150, ${formatStringLiteral(
          // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
          t`Medium`,
          // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
        )}, ${formatStringLiteral(t`Small`)}`,
      },
    ],
  },
  {
    name: "in",
    structure: "in",
    description: () =>
      t`Returns true if value1 equals value2 (or value3, etc. if specified).`,
    args: [
      {
        get name() {
          return t`value1`;
        },
        get description() {
          return t`The column or value to check.`;
        },
        // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
        example: formatIdentifier(t`Category`),
      },
      {
        get name() {
          return t`value2`;
        },
        get description() {
          return t`The column or value to look for.`;
        },
        example: formatStringLiteral("Widget"),
      },
      {
        name: "…",
        get description() {
          return t`You can add more values to look for.`;
        },
        example: formatStringLiteral("Gadget"),
      },
    ],
  },
  {
    name: "not-in",
    structure: "notIn",
    description: () =>
      t`Returns true if value1 doesn't equal value2 (and value3, etc. if specified).`,
    args: [
      {
        get name() {
          return t`value1`;
        },
        get description() {
          return t`The column or value to check.`;
        },
        // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
        example: formatIdentifier(t`Category`),
      },
      {
        get name() {
          return t`value2`;
        },
        get description() {
          return t`The column or value to look for.`;
        },
        example: formatStringLiteral("Widget"),
      },
      {
        name: "…",
        get description() {
          return t`You can add more values to look for.`;
        },
        example: formatStringLiteral("Gadget"),
      },
    ],
  },
  {
    name: "get-year",
    structure: "year",
    description: () =>
      t`Takes a datetime and returns an integer with the number of the year.`,
    args: [
      {
        get name() {
          return t`column`;
        },
        get description() {
          return t`The datetime column.`;
        },
        // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
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
        get name() {
          return t`column`;
        },
        get description() {
          return t`The datetime column.`;
        },
        // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
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
        get name() {
          return t`column`;
        },
        get description() {
          return t`The datetime column.`;
        },
        // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
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
        get name() {
          return t`column`;
        },
        get description() {
          return t`The name of the column with your date or datetime value.`;
        },
        // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
        example: formatIdentifier(t`Created At`),
      },
      {
        get name() {
          return t`mode`;
        },
        // TODO: This is the only place that's not easy to replace the application name.
        get description() {
          // eslint-disable-next-line no-literal-metabase-strings -- Hard to replace the application name because it's not a React component
          return t`Optional. The default is "ISO".
  - ISO: Week 1 starts on the Monday before the first Thursday of January.
  - US: Week 1 starts on Jan 1. All other weeks start on Sunday.
  - Instance: Week 1 starts on Jan 1. All other weeks start on the day defined in your Metabase localization settings.
  `;
        },
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
        get name() {
          return t`column`;
        },
        get description() {
          return t`The datetime column.`;
        },
        // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
        example: formatIdentifier(t`Created At`),
      },
    ],
  },
  {
    name: "get-day-of-week",
    structure: "weekday",
    description: () =>
      t`Takes a datetime and returns an integer (1-7) with the number of the day of the week. Which day is 1 is defined in your localization settings.`,
    args: [
      {
        get name() {
          return t`column`;
        },
        get description() {
          return t`The datetime column.`;
        },
        // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
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
        get name() {
          return t`column`;
        },
        get description() {
          return t`The datetime column.`;
        },
        // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
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
        get name() {
          return t`column`;
        },
        get description() {
          return t`The datetime column.`;
        },
        // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
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
        get name() {
          return t`column`;
        },
        get description() {
          return t`The datetime column.`;
        },
        // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
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
        get name() {
          return t`column`;
        },
        get description() {
          return t`The column with your date or timestamp values.`;
        },
        // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
        example: formatIdentifier(t`Created At`),
      },
      {
        get name() {
          return t`amount`;
        },
        get description() {
          return t`The number of units to be added.`;
        },
        example: "1",
      },
      {
        get name() {
          return t`unit`;
        },
        get description() {
          return t`Choose from: ${"year"}, ${"quarter"}, ${"month"}, ${"week"}, ${"day"}, ${"hour"}, ${"minute"}, ${"second"}, or ${"millisecond"}.`;
        },
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
        get name() {
          return t`column`;
        },
        get description() {
          return t`The column with your date or timestamp values.`;
        },
        // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
        example: formatIdentifier(t`Created At`),
      },
      {
        get name() {
          return t`amount`;
        },
        get description() {
          return t`The number of units to be subtracted.`;
        },
        example: "1",
      },
      {
        get name() {
          return t`unit`;
        },
        get description() {
          return t`Choose from: ${"year"}, ${"quarter"}, ${"month"}, ${"week"}, ${"day"}, ${"hour"}, ${"minute"}, ${"second"}, or ${"millisecond"}.`;
        },
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
We support tz database time zone names.`,
    args: [
      {
        get name() {
          return t`column`;
        },
        get description() {
          return t`The column with your date or timestamp values.`;
        },
        // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
        example: formatIdentifier(t`Created At`),
      },
      {
        get name() {
          return t`target`;
        },
        get description() {
          return t`The timezone you want to assign to your column.`;
        },
        example: formatStringLiteral("Asia/Ho_Chi_Minh"),
      },
      {
        get name() {
          return t`source`;
        },
        get description() {
          return t`The current time zone. Only required for timestamps with no time zone.`;
        },
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

const getHelpExample = ({ structure, args }: HelpTextConfig): string => {
  const exampleParameters =
    args?.length && args.map(({ example }) => example).join(", ");

  return `${structure}${exampleParameters ? `(${exampleParameters})` : ""}`;
};

export const getHelpDocsUrl = ({ docsPage }: HelpText): string => {
  return docsPage
    ? `questions/query-builder/expressions/${docsPage}`
    : "questions/query-builder/expressions";
};
