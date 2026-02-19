import dayjs from "dayjs";
import { t } from "ttag";

import type * as Lib from "metabase-lib";

import { defineClauses, dimension, op } from "./define";
import { MBQLClauseCategory as CATEGORY } from "./types";

const WINDOW = defineClauses(
  { category: CATEGORY.Window },
  {
    "cum-count": {
      displayName: "CumulativeCount",
      type: "aggregation",
      description: () => t`The additive total of rows across a breakout.`,
      docsPage: "cumulative",
      args: () => [],
    },
    "cum-sum": {
      displayName: "CumulativeSum",
      type: "aggregation",
      description: () => t`The rolling sum of a column across a breakout.`,
      args: () => [
        {
          name: t`column`,
          type: "number",
          description: t`The column or number to sum.`,
          example: dimension(t`Subtotal`),
        },
      ],
      docsPage: "cumulative",
    },
    offset: {
      displayName: "Offset",
      type: "any", // ideally we'd dynamically infer it from the first argument
      requiresFeature: "window-functions/offset",
      validator(_expr: Lib.ExpressionParts, offset: number) {
        if (offset === 0) {
          return t`Row offset cannot be zero`;
        }
      },
      hasOptions: true,
      description: () =>
        t`Returns the value of an aggregation expression in a different row`,
      args: () => [
        {
          name: t`expression`,
          type: "any",
          description: t`The value to get from a different row.`,
          example: op("sum", dimension(t`Total`)),
        },
        {
          name: t`rowOffset`,
          type: "number",
          description: t`Row number relative to the current row, for example \`-1\` for the previous row or \`1\` for the next row.`,
          example: -1,
        },
      ],
      docsPage: "offset",
    },
  },
);

const AGGREGATION = defineClauses(
  { category: CATEGORY.Aggregation },
  {
    count: {
      displayName: "Count",
      type: "aggregation",
      description: () => t`Returns the count of rows in the selected data.`,
      args: () => [],
    },
    sum: {
      displayName: "Sum",
      type: "aggregation",
      description: () => t`Adds up all the values of the column.`,
      args: () => [
        {
          name: t`column`,
          type: "number",
          description: t`The column or number to sum.`,
          example: dimension(t`Subtotal`),
        },
      ],
    },
    distinct: {
      displayName: "Distinct",
      type: "aggregation",
      description: () => t`The number of distinct values in this column.`,
      args: () => [
        {
          name: t`column`,
          type: "expression",
          description: t`The column whose distinct values to count.`,
          example: dimension(t`Last Name`),
        },
      ],
    },
    stddev: {
      displayName: "StandardDeviation",
      type: "aggregation",
      requiresFeature: "standard-deviation-aggregations",
      description: () => t`Calculates the standard deviation of the column.`,
      args: () => [
        {
          name: t`column`,
          type: "number",
          description: t`The numeric column to get standard deviation of.`,
          example: dimension(t`Population`),
        },
      ],
    },
    avg: {
      displayName: "Average",
      type: "aggregation",
      description: () => t`Returns the average of the values in the column.`,
      args: () => [
        {
          name: t`column`,
          type: "number",
          description: t`The numeric column whose values to average.`,
          example: dimension(t`Quantity`),
        },
      ],
    },
    median: {
      displayName: "Median",
      type: "aggregation",
      requiresFeature: "percentile-aggregations",
      description: () => t`Returns the median of all the values of a column.`,
      args: () => [
        {
          name: t`column`,
          type: "number",
          description: t`The numeric column whose values to average.`,
          example: dimension(t`Quantity`),
        },
      ],
    },
    min: {
      displayName: "Min",
      type: "aggregation",
      description: () => t`Returns the smallest value found in the column`,
      args: () => [
        {
          name: t`column`,
          type: "expression",
          description: t`The numeric column whose minimum you want to find.`,
          example: dimension(t`Salary`),
        },
      ],
    },
    max: {
      displayName: "Max",
      type: "aggregation",
      description: () => t`Returns the largest value found in the column.`,
      args: () => [
        {
          name: t`column`,
          type: "expression",
          description: t`The numeric column whose maximum you want to find.`,
          example: dimension(t`Age`),
        },
      ],
    },
    share: {
      displayName: "Share",
      type: "aggregation",
      description: () =>
        t`Returns the percent of rows in the data that match the condition, as a decimal.`,
      args: () => [
        {
          name: t`condition`,
          type: "boolean",
          description: t`Something that should evaluate to \`true\` or \`false\`.`,
          example: op("=", dimension(t`Source`), "Google"),
        },
      ],
    },
    "count-where": {
      displayName: "CountIf",
      type: "aggregation",
      description: () => t`Only counts rows where the condition is \`true\`.`,
      args: () => [
        {
          name: t`condition`,
          type: "boolean",
          description: t`Something that should evaluate to \`true\` or \`false\`.`,
          example: op(">", dimension(t`Subtotal`), 100),
        },
      ],
      docsPage: "countif",
    },
    "distinct-where": {
      displayName: "DistinctIf",
      type: "aggregation",
      requiresFeature: "distinct-where",
      description: () =>
        t`The count of distinct values in this column for rows where the condition is \`true\`.`,
      args: () => [
        {
          name: t`column`,
          type: "number",
          description: t`The column to count distinct values in.`,
          example: dimension(t`Customer ID`),
        },
        {
          name: t`condition`,
          type: "boolean",
          description: t`Something that evaluates to \`true\` or \`false\`.`,
          example: op("=", dimension(t`Order Status`), "Completed"),
        },
      ],
    },
    "sum-where": {
      displayName: "SumIf",
      type: "aggregation",
      description: () =>
        t`Sums up the specified column only for rows where the condition is \`true\`.`,
      args: () => [
        {
          name: t`column`,
          type: "number",
          description: t`The numeric column to sum.`,
          example: dimension(t`Subtotal`),
        },
        {
          name: t`condition`,
          type: "boolean",
          description: t`Something that evaluates to \`true\` or \`false\`.`,
          example: op("=", dimension(t`Order Status`), "Valid"),
        },
      ],
      docsPage: "sumif",
    },
    var: {
      displayName: "Variance",
      type: "aggregation",
      requiresFeature: "standard-deviation-aggregations",
      description: () => t`Returns the numeric variance for a given column.`,
      args: () => [
        {
          name: t`column`,
          type: "number",
          description: t`The column or number to get the variance of.`,
          example: dimension(t`Temperature`),
        },
      ],
    },
    percentile: {
      displayName: "Percentile",
      type: "aggregation",
      requiresFeature: "percentile-aggregations",
      description: () =>
        t`Returns the value of the column at the percentile value.`,
      args: () => [
        {
          name: t`column`,
          type: "number",
          description: t`The column or number to get the percentile of.`,
          example: dimension(t`Score`),
        },
        {
          name: t`percentile-value`,
          type: "number",
          description: t`The value of the percentile.`,
          example: 0.9,
        },
      ],
    },
  },
);

const CONVERSION = defineClauses(
  { category: CATEGORY.Conversion },
  {
    text: {
      displayName: "text",
      type: "string",
      requiresFeature: "expressions/text",
      description: () =>
        t`Converts a number or date to text. Useful for applying text filters or joining with other columns based on text comparisons.`,
      args: () => [
        {
          name: t`value`,
          type: "expression",
          description: t`The number or date to convert to text.`,
          example: dimension("User ID"),
        },
      ],
    },
    integer: {
      displayName: "integer",
      type: "number",
      requiresFeature: "expressions/integer",
      description: () =>
        t`The string or float column to convert to integers. Float values are rounded.`,
      args: () => [
        {
          name: t`value`,
          type: "expression",
          description: t`The string or float column to convert to integers.`,
          example: dimension("User ID"),
        },
      ],
    },
    date: {
      displayName: "date",
      type: "datetime",
      requiresFeature: "expressions/date",
      description: () =>
        t`Converts a datetime or an ISO 8601 datetime string to a date. Time part is truncated.`,
      args: () => [
        {
          name: t`value`,
          type: "expression",
          description: t`The string or datetime to convert to a date.`,
          example: "2025-03-20",
        },
      ],
    },
    datetime: {
      displayName: "datetime",
      type: "datetime",
      requiresFeature: "expressions/datetime",
      description: () => t`Converts a datetime string or bytes to a datetime.`,
      hasOptions: true,
      args: () => [
        {
          name: t`value`,
          type: "expression",
          description: t`The string, bytes, or number to convert to a datetime.`,
          example: "2025-03-20 12:45:04",
        },
        {
          name: t`mode`,
          type: "string",
          description: t`The mode indicating the format. One of: \`"simple"\`, \`"iso"\`, \`"simpleBytes"\`, \`"isoBytes"\`, \`"unixSeconds"\`, \`"unixMilliseconds"\`, \`"unixMicroseconds"\`, \`"unixNanoseconds"\`. Default is \`"iso"\`.`,
          optional: true,
        },
      ],
    },
    today: {
      displayName: "today",
      type: "datetime",
      requiresFeature: "expressions/today",
      description: () => t`Returns the current date.`,
      args: () => [],
    },
    float: {
      displayName: "float",
      type: "number",
      requiresFeature: "expressions/float",
      description: () => t`Converts a string to a floating-point number.`,
      args: () => [
        {
          name: t`value`,
          type: "expression",
          description: t`The string column to convert to floats.`,
          example: dimension("Text Rating"),
        },
      ],
    },
  },
);

const STRING = defineClauses(
  { category: CATEGORY.String },
  {
    lower: {
      displayName: "lower",
      type: "string",
      description: () => t`Returns the string of text in all lower case.`,
      args: () => [
        {
          name: t`value`,
          type: "string",
          description: t`The column with values to convert to lower case.`,
          example: dimension(t`Status`),
        },
      ],
    },
    upper: {
      displayName: "upper",
      type: "string",
      description: () => t`Returns the text in all upper case.`,
      args: () => [
        {
          name: t`value`,
          type: "string",
          description: t`The column with values to convert to upper case.`,
          example: dimension(t`Status`),
        },
      ],
    },
    substring: {
      displayName: "substring",
      type: "string",
      validator(_arg: Lib.ExpressionParts, start: number, _length: number) {
        if (start <= 0) {
          return t`Expected positive integer but found ${start}`;
        }
      },
      description: () => t`Returns a portion of the supplied text.`,
      args: () => [
        {
          name: t`value`,
          type: "string",
          description: t`The column or text to return a portion of.`,
          example: dimension(t`Title`),
        },
        {
          name: t`position`,
          type: "number",
          description: t`The position to start copying characters. Index starts at position \`1\`.`,
          example: 1,
        },
        {
          name: t`length`,
          type: "number",
          description: t`The number of characters to return.`,
          example: 10,
        },
      ],
      docsPage: "substring",
    },
    "split-part": {
      displayName: "splitPart",
      type: "string",
      validator(
        _arg: Lib.ExpressionParts,
        _delimeter: string,
        position: number,
      ) {
        if (position < 1) {
          return t`Expected positive integer but found ${position}`;
        }
      },
      requiresFeature: "split-part",
      description: () =>
        t`Splits a string on a specified delimiter and returns the nth substring.`,
      args: () => [
        {
          name: t`text`,
          type: "string",
          description: t`The column or text to return a portion of.`,
          example: dimension(t`Title`),
        },
        {
          name: t`delimiter`,
          type: "string",
          description: t`The pattern describing where each split should occur.`,
          example: ",",
        },
        {
          name: t`position`,
          type: "number",
          description: t`Which substring to return after the split. Index starts at position \`1\`.`,
          example: 1,
        },
      ],
    },
    collate: {
      displayName: "collate",
      type: "string",
      requiresFeature: "collate",
      description: () =>
        t`Applies a collation to a text value for sorting and comparison purposes.`,
      args: () => [
        {
          name: t`value`,
          type: "string",
          description: t`The column or text to apply the collation to.`,
          example: dimension(t`Name`),
        },
        {
          name: t`collation`,
          type: "string",
          description: t`The collation specification.`,
          example: t`en-ci-ai`,
        },
      ],
    },
    "regex-match-first": {
      displayName: `regexExtract`,
      type: "string",
      requiresFeature: "regex",
      description: () =>
        t`Extracts matching substrings according to a regular expression.`,
      args: () => [
        {
          name: t`value`,
          type: "string",
          description: t`The column or text to search through.`,
          example: dimension(t`Address`),
        },
        {
          name: t`regular_expression`,
          type: "string",
          description: t`The regular expression to match.`,
          example: "[0-9]+",
        },
      ],
      docsPage: "regexextract",
    },
    path: {
      displayName: "path",
      type: "string",
      requiresFeature: "regex/lookaheads-and-lookbehinds",
      description: () =>
        t`Extracts the pathname from a URL. E.g., \`${'path("https://www.example.com/path/to/page.html?key1=value)'}\` would return \`${"/path/to/page.html"}\`.`,
      args: () => [
        {
          name: t`url`,
          type: "string",
          description: t`A column containing URLs`,
          example: dimension(t`URL`),
        },
      ],
    },
    concat: {
      displayName: "concat",
      type: "string",
      multiple: true,
      description: () => t`Combine two or more strings of text together.`,
      args: () => [
        {
          name: t`value1`,
          type: "expression",
          description: t`The column or text to begin with.`,
          example: dimension(t`Last Name`),
        },
        {
          name: t`value2`,
          type: "expression",
          description: t`This will be added to the end of \`$value1\`.`,
          example: ", ",
        },
        {
          name: "…",
          type: "string",
          description: t`This will be added to the end of \`$value2\`, and so on.`,
          example: dimension(t`First Name`),
          optional: true,
        },
      ],
      docsPage: "concat",
    },
    replace: {
      displayName: "replace",
      type: "string",
      description: () => t`Replaces a part of the input text with new text.`,
      args: () => [
        {
          name: t`value`,
          type: "string",
          description: t`The column or text to search through.`,
          example: dimension(t`Title`),
        },
        {
          name: t`find`,
          type: "string",
          description: t`The text to find.`,
          example: t`Enormous`,
        },
        {
          name: t`replace`,
          type: "string",
          description: t`The text to use as the replacement.`,
          example: t`Gigantic`,
        },
      ],
    },
    length: {
      displayName: "length",
      type: "number",
      description: () => t`Returns the number of characters in text.`,
      args: () => [
        {
          name: t`value`,
          type: "string",
          description: t`The column or text you want to get the length of.`,
          example: dimension(t`Comment`),
        },
      ],
    },
    trim: {
      displayName: "trim",
      type: "string",
      description: () =>
        t`Removes leading and trailing whitespace from a string of text.`,
      args: () => [
        {
          name: t`value`,
          type: "string",
          description: t`The column or text you want to trim.`,
          example: dimension(t`Comment`),
        },
      ],
    },
    rtrim: {
      displayName: "rTrim",
      type: "string",
      description: () => t`Removes trailing whitespace from a string of text.`,
      args: () => [
        {
          name: t`value`,
          type: "string",
          description: t`The column or text you want to trim.`,
          example: dimension(t`Comment`),
        },
      ],
    },
    ltrim: {
      displayName: "lTrim",
      type: "string",
      description: () => t`Removes leading whitespace from a string of text.`,
      args: () => [
        {
          name: t`value`,
          type: "string",
          description: t`The column or text you want to trim.`,
          example: dimension(t`Comment`),
        },
      ],
    },
    domain: {
      displayName: "domain",
      type: "string",
      requiresFeature: "regex/lookaheads-and-lookbehinds",
      description: () =>
        t`Extracts the domain name (eg. \`"metabase"\`) from a URL or email`,
      args: () => [
        {
          name: t`urlOrEmail`,
          type: "string",
          description: t`The URL or Email column to extract domain names from.`,
          example: dimension(t`Email`),
        },
      ],
    },
    subdomain: {
      displayName: "subdomain",
      type: "string",
      requiresFeature: "regex/lookaheads-and-lookbehinds",
      description: () =>
        t`Extracts the first subdomain (eg. \`"status"\` from \`"status.metabase.com"\`, \`""\` from \`"bbc.co.uk"\`) from a URL. Ignores \`"www"\`.`,
      args: () => [
        {
          name: t`url`,
          type: "string",
          description: t`The URL column to extract the subdomain from.`,
          example: dimension(t`ProfileImage`),
        },
      ],
    },
    host: {
      displayName: "host",
      type: "string",
      requiresFeature: "regex/lookaheads-and-lookbehinds",
      description: () =>
        t`Extracts the host (domain name and TLD, eg. \`"metabase.com"\` from \`"status.metabase.com"\`) from a URL or email`,
      args: () => [
        {
          name: t`urlOrEmail`,
          type: "string",
          description: t`The URL or Email column to extract the host from.`,
          example: dimension(t`Email`),
        },
      ],
    },
    contains: {
      displayName: "contains",
      type: "boolean",
      multiple: true,
      hasOptions: true,
      description: () =>
        t`Returns \`true\` if \`$string1\` contains \`$string2\` within it (or \`$string3\`, etc. if specified).`,
      args: () => [
        {
          name: t`string1`,
          type: "string",
          description: t`The column or text to check.`,
          example: dimension(t`Title`),
        },
        {
          name: t`string2`,
          type: "string",
          description: t`The string of text to look for.`,
          example: t`Small`,
        },
        {
          name: "…",
          description: t`You can add more values to look for.`,
          example: t`Medium`,
          type: "string",
          optional: true,
        },
        {
          name: "caseSensitivity",
          type: "string",
          description: t`Optional. Set to \`"case-insensitive"\` to perform a case-insensitive match.`,
          example: "case-insensitive",
          template: '"case-insensitive"',
          optional: true,
        },
      ],
    },
    "does-not-contain": {
      displayName: "doesNotContain",
      type: "boolean",
      multiple: true,
      hasOptions: true,
      description: () =>
        t`Returns \`true\` if \`$string1\` does not contain \`$string2\` within it (and \`$string3\`, etc. if specified).`,
      args: () => [
        {
          name: t`string1`,
          type: "string",
          description: t`The column or text to check.`,
          example: dimension(t`Title`),
        },
        {
          name: t`string2`,
          type: "string",
          description: t`The string of text to look for.`,
          example: t`Small`,
        },
        {
          name: "…",
          description: t`You can add more values to look for.`,
          example: t`Medium`,
          type: "string",
          optional: true,
        },
        {
          name: "caseSensitivity",
          description: t`Optional. Set to \`"case-insensitive"\` to perform a case-insensitive match.`,
          example: "case-insensitive",
          template: '"case-insensitive"',
          type: "string",
          optional: true,
        },
      ],
    },
    "starts-with": {
      displayName: "startsWith",
      type: "boolean",
      multiple: true,
      hasOptions: true,
      description: () =>
        t`Returns true if the beginning of the \`$string1\` matches the \`$string2\` (or \`$string3\`, etc. if specified).`,
      args: () => [
        {
          name: t`string1`,
          type: "string",
          description: t`The column or text to check.`,
          example: dimension(t`Title`),
        },
        {
          name: t`string2`,
          type: "string",
          description: t`The string of text to look for.`,
          example: t`Small`,
        },
        {
          name: "…",
          type: "string",
          description: t`You can add more values to look for.`,
          example: t`Medium`,
          optional: true,
        },
        {
          name: "caseSensitivity",
          type: "string",
          description: t`Optional. Set to \`"case-insensitive"\` to perform a case-insensitive match.`,
          example: "case-insensitive",
          template: '"case-insensitive"',
          optional: true,
        },
      ],
    },
    "ends-with": {
      displayName: "endsWith",
      type: "boolean",
      multiple: true,
      hasOptions: true,
      description: () =>
        t`Returns true if the end of the \`$string1\` matches the \`$string2\` (or \`$string3\`, etc. if specified).`,
      args: () => [
        {
          name: t`string1`,
          type: "string",
          description: t`The column or text to check.`,
          example: dimension(t`Title`),
        },
        {
          name: t`string2`,
          type: "string",
          description: t`The string of text to look for.`,
          example: t`Small`,
        },
        {
          name: "…",
          type: "string",
          description: t`You can add more values to look for.`,
          example: t`Medium`,
          optional: true,
        },
        {
          name: "caseSensitivity",
          description: t`Optional. Set to \`"case-insensitive"\` to perform a case-insensitive match.`,
          example: "case-insensitive",
          template: '"case-insensitive"',
          type: "string",
          optional: true,
        },
      ],
    },
    "is-empty": {
      displayName: "isEmpty",
      type: "boolean",
      description: () => t`Checks if a column is empty`,
      args: () => [
        {
          name: t`column`,
          type: "expression",
          description: t`The column to check.`,
          example: dimension(t`Name`),
        },
      ],
      docsPage: "isempty",
    },
    "not-empty": {
      displayName: "notEmpty",
      type: "boolean",
      description: () => t`Checks if a column is not empty`,
      args: () => [
        {
          name: t`column`,
          type: "expression",
          description: t`The column to check.`,
          example: dimension(t`Name`),
        },
      ],
    },
  },
);

const DATE = defineClauses(
  { category: CATEGORY.Date },
  {
    "month-name": {
      displayName: "monthName",
      type: "string",
      description: () =>
        t`Returns the localized short name (eg. \`"Apr"\`) for the given month number (eg. \`4\`)`,
      args: () => [
        {
          name: t`monthNumber`,
          type: "number",
          description: t`Column or expression giving the number of a month in the year, \`1\` to \`12\`.`,
          example: dimension(t`Birthday Month`),
        },
      ],
    },
    "quarter-name": {
      displayName: "quarterName",
      type: "string",
      description: () =>
        t`Returns a string like \`"Q1"\`, given the quarter number`,
      args: () => [
        {
          name: t`quarterNumber`,
          type: "number",
          description: t`Column or expression giving the number of a quarter of the year, \`1\` to \`4\`.`,
          example: dimension(t`Fiscal Quarter`),
        },
      ],
    },
    "day-name": {
      displayName: "dayName",
      type: "string",
      description: () =>
        t`Returns the localized name of a day of the week, given the day's number.`,
      args: () => [
        {
          name: t`dayNumber`,
          type: "number",
          description: t`Column or expression giving the number of a day of the week, \`1\` to \`7\`. Which day is \`1\` is defined in your localization setting; default Sunday.`,
          example: dimension(t`Weekday`),
        },
      ],
    },
    interval: {
      displayName: "timeSpan",
      type: "number",
      description: () => t`Gets a time interval of specified length`,
      args: () => [
        {
          name: t`number`,
          type: "number",
          description: t`Period of interval, where negative values are back in time.`,
          example: 7,
        },
        {
          name: t`unit`,
          type: "string",
          description: t`Type of interval like ${"day"}, ${"month"}, ${"year"}.`,
          example: "day",
        },
      ],
    },
    "time-interval": {
      displayName: "interval",
      type: "boolean",
      hasOptions: true,
      description: () =>
        t`Checks a date column's values to see if they're within the relative range.`,
      args: () => [
        {
          name: t`column`,
          type: "expression",
          description: t`The date column to return interval of.`,
          example: dimension(t`Created At`),
        },
        {
          name: t`number`,
          type: "number",
          description: t`Period of interval, where negative values are back in time.`,
          example: -1,
        },
        {
          name: t`unit`,
          type: "string",
          description: t`Type of interval like ${"day"}, ${"month"}, ${"year"}.`,
          example: "month",
        },
      ],
    },
    "relative-time-interval": {
      displayName: "intervalStartingFrom",
      type: "boolean",
      description: () =>
        t`Returns true if a column's value falls within an interval, starting from an initial, offsetting interval.`,
      args: () => [
        {
          name: t`column`,
          type: "expression",
          description: t`The date column to check.`,
          example: dimension(t`Created At`),
        },
        {
          name: t`value`,
          type: "number",
          description: t`Period of the interval, where negative numbers go back in time.`,
          example: -20,
        },
        {
          name: t`unit`,
          type: "string",
          description: t`Type of interval like ${"day"}, ${"month"}, ${"year"}.`,
          example: "month",
        },
        {
          name: t`offsetValue`,
          type: "number",
          description: t`The initial interval period to start from, where negative values are back in time.`,
          example: -10,
        },
        {
          name: t`offsetUnit`,
          type: "string",
          description: t`Type of interval like ${"day"}, ${"month"}, ${"year"}.`,
          example: "year",
        },
      ],
    },
    "relative-datetime": {
      displayName: "relativeDateTime",
      type: "expression",
      description: () => t`Gets a timestamp relative to the current time`,
      args: () => [
        {
          name: t`number`,
          type: "number",
          description: t`Period of interval, where negative values are back in time.`,
          example: -30,
        },
        {
          name: t`unit`,
          type: "string",
          description: t`Type of interval like ${"day"}, ${"month"}, ${"year"}.`,
          example: "day",
        },
      ],
    },
    "get-year": {
      displayName: "year",
      type: "number",
      description: () =>
        t`Takes a datetime and returns an integer with the number of the year.`,
      args: () => [
        {
          name: t`column`,
          type: "datetime",
          description: t`The datetime column.`,
          example: dimension(t`Created At`),
        },
      ],
    },
    "get-quarter": {
      displayName: "quarter",
      type: "number",
      description: () =>
        t`Takes a datetime and returns an integer (\`1\`-\`4\`) with the number of the quarter in the year.`,
      args: () => [
        {
          name: t`column`,
          type: "datetime",
          description: t`The datetime column.`,
          example: dimension(t`Created At`),
        },
      ],
    },
    "get-month": {
      displayName: "month",
      type: "number",
      description: () =>
        t`Takes a datetime and returns an integer (\`1\`-\`12\`) with the number of the month in the year.`,
      args: () => [
        {
          name: t`column`,
          type: "datetime",
          description: t`The datetime column.`,
          example: dimension(t`Created At`),
        },
      ],
    },
    "get-week": {
      displayName: "week",
      type: "number",
      hasOptions: true, // optional mode parameter
      description: () => t`Extracts the week of the year as an integer.`,
      args: () => [
        {
          name: t`column`,
          type: "datetime",
          description: t`The name of the column with your date or datetime value.`,
          example: dimension(t`Created At`),
        },
        {
          name: t`mode`,
          type: "string",
          optional: true,
          description:
            // TODO: This is the only place that's not easy to replace the application name.
            // eslint-disable-next-line metabase/no-literal-metabase-strings -- Hard to replace the application name because it's not a React component
            t`Optional. The default is \`"ISO"\`.
  - ISO: Week 1 starts on the Monday before the first Thursday of January.
  - US: Week 1 starts on Jan 1. All other weeks start on Sunday.
  - Instance: Week 1 starts on Jan 1. All other weeks start on the day defined in your Metabase localization settings.
  `,
          example: "iso",
        },
      ],
      docsPage: "week",
    },
    "get-day": {
      displayName: "day",
      type: "number",
      description: () =>
        t`Takes a datetime and returns an integer (\`1\`-\`31\`) with the number of the day of the month.`,
      args: () => [
        {
          name: t`column`,
          type: "datetime",
          description: t`The datetime column.`,
          example: dimension(t`Created At`),
        },
      ],
    },
    "get-day-of-week": {
      displayName: "weekday",
      type: "number",
      hasOptions: true, // optional mode parameter
      description: () =>
        t`Takes a datetime and returns an integer (\`1\`-\`7\`) with the number of the day of the week. Which day is \`1\` is defined in your localization settings.`,
      args: () => [
        {
          name: t`column`,
          type: "datetime",
          description: t`The datetime column.`,
          example: dimension(t`Created At`),
        },
      ],
    },
    "get-hour": {
      displayName: "hour",
      type: "number",
      description: () =>
        t`Takes a datetime and returns an integer (\`0\`-\`23\`) with the number of the hour. No AM/PM.`,
      args: () => [
        {
          name: t`column`,
          type: "datetime",
          description: t`The datetime column.`,
          example: dimension(t`Created At`),
        },
      ],
    },
    "get-minute": {
      displayName: "minute",
      type: "number",
      description: () =>
        t`Takes a datetime and returns an integer (\`0\`-\`59\`) with the number of the minute in the hour.`,
      args: () => [
        {
          name: t`column`,
          type: "datetime",
          description: t`The datetime column.`,
          example: dimension(t`Created At`),
        },
      ],
    },
    "get-second": {
      displayName: "second",
      type: "number",
      description: () =>
        t`Takes a datetime and returns an integer (\`0\`-\`59\`) with the number of the seconds in the minute.`,
      args: () => [
        {
          name: t`column`,
          type: "datetime",
          description: t`The datetime column.`,
          example: dimension(t`Created At`),
        },
      ],
    },
    "datetime-diff": {
      displayName: "datetimeDiff",
      type: "number",
      requiresFeature: "datetime-diff",
      description: () =>
        t`Get the difference between two datetime values (\`$datetime2\` minus \`$datetime1\`) using the specified unit of time.`,
      args: () => [
        {
          name: t`datetime1`,
          type: "datetime",
          description: t`The column or expression with your datetime value.`,
          example: dimension(t`Created At`),
        },
        {
          name: t`datetime2`,
          type: "datetime",
          description: t`The column or expression with your datetime value.`,
          example: dimension(t`Shipped At`),
        },
        {
          name: t`unit`,
          type: "string",
          description: t`Choose from: ${"year"}, ${"quarter"}, ${"month"}, ${"week"}, ${"day"}, ${"hour"}, ${"minute"}, or ${"second"}.`,
          example: "month",
        },
      ],
      docsPage: "datetimediff",
    },
    "datetime-add": {
      displayName: "datetimeAdd",
      type: "datetime",
      description: () =>
        t`Adds some units of time to a date or timestamp value.`,
      args: () => [
        {
          name: t`column`,
          type: "datetime",
          description: t`The column with your date or timestamp values.`,
          example: dimension(t`Created At`),
        },
        {
          name: t`amount`,
          type: "number",
          description: t`The number of units to be added.`,
          example: 1,
        },
        {
          name: t`unit`,
          type: "string",
          description: t`Choose from: ${"year"}, ${"quarter"}, ${"month"}, ${"week"}, ${"day"}, ${"hour"}, ${"minute"}, ${"second"}, or ${"millisecond"}.`,
          example: "month",
        },
      ],
      docsPage: "datetimeadd",
    },
    "datetime-subtract": {
      displayName: "datetimeSubtract",
      type: "datetime",
      description: () =>
        t`Subtracts some units of time to a date or timestamp value.`,
      args: () => [
        {
          name: t`column`,
          type: "datetime",
          description: t`The column with your date or timestamp values.`,
          example: dimension(t`Created At`),
        },
        {
          name: t`amount`,
          type: "number",
          description: t`The number of units to be subtracted.`,
          example: 1,
        },
        {
          name: t`unit`,
          type: "string",
          description: t`Choose from: ${"year"}, ${"quarter"}, ${"month"}, ${"week"}, ${"day"}, ${"hour"}, ${"minute"}, ${"second"}, or ${"millisecond"}.`,
          example: "month",
        },
      ],
      docsPage: "datetimesubtract",
    },
    now: {
      displayName: "now",
      type: "datetime",
      description(database, reportTimezone) {
        const hasTimezoneFeatureFlag =
          database.features?.includes("set-timezone");
        const timezone = hasTimezoneFeatureFlag ? reportTimezone : "UTC";
        const nowAtTimezone =
          timezone && reportTimezone
            ? dayjs().tz(reportTimezone).format("LT")
            : dayjs().format("LT");

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
      },
      args: () => [],
      docsPage: "now",
    },
    "convert-timezone": {
      displayName: "convertTimezone",
      type: "datetime",
      hasOptions: true,
      requiresFeature: "convert-timezone",
      description: () => t`Convert timezone of a date or timestamp column.
We support tz database time zone names.`,
      args: () => [
        {
          name: t`column`,
          type: "datetime",
          description: t`The column with your date or timestamp values.`,
          example: dimension(t`Created At`),
        },
        {
          name: t`target`,
          type: "string",
          description: t`The timezone you want to assign to your column.`,
          example: "Asia/Ho_Chi_Minh",
        },
        {
          name: t`source`,
          type: "string",
          description: t`The current time zone. Only required for timestamps with no time zone.`,
          optional: true,
          example: "UTC",
        },
      ],
      docsPage: "converttimezone",
    },
  },
);

const MATH = defineClauses(
  { category: CATEGORY.Math },
  {
    abs: {
      displayName: "abs",
      type: "number",
      requiresFeature: "expressions",
      description: () =>
        t`Returns the absolute (positive) value of the specified column.`,
      args: () => [
        {
          name: t`column`,
          type: "number",
          description: t`The column or number to return absolute (positive) value of.`,
          example: dimension(t`Debt`),
        },
      ],
    },
    floor: {
      displayName: "floor",
      type: "number",
      requiresFeature: "expressions",
      description: () => t`Rounds a decimal number down.`,
      args: () => [
        {
          name: t`column`,
          type: "number",
          description: t`The column or number to round down.`,
          example: dimension(t`Price`),
        },
      ],
    },
    ceil: {
      displayName: "ceil",
      type: "number",
      requiresFeature: "expressions",
      description: () => t`Rounds a decimal number up.`,
      args: () => [
        {
          name: t`column`,
          type: "number",
          description: t`The column or number to round up.`,
          example: dimension(t`Price`),
        },
      ],
    },
    round: {
      displayName: "round",
      type: "number",
      requiresFeature: "expressions",
      description: () =>
        t`Rounds a decimal number either up or down to the nearest integer value.`,
      args: () => [
        {
          name: t`column`,
          type: "number",
          description: t`The column or number to round to nearest integer.`,
          example: dimension(t`Temperature`),
        },
      ],
    },
    sqrt: {
      displayName: "sqrt",
      type: "number",
      requiresFeature: "advanced-math-expressions",
      description: () => t`Returns the square root.`,
      args: () => [
        {
          name: t`column`,
          type: "number",
          description: t`The column or number to return square root value of.`,
          example: dimension(t`Hypotenuse`),
        },
      ],
    },
    power: {
      displayName: "power",
      type: "number",
      requiresFeature: "advanced-math-expressions",
      description: () => t`Raises a number to the power of the exponent value.`,
      args: () => [
        {
          name: t`column`,
          type: "number",
          description: t`The column or number raised to the exponent.`,
          example: dimension(t`Length`),
        },
        {
          name: t`exponent`,
          type: "number",
          description: t`The value of the exponent.`,
          example: 2,
        },
      ],
    },
    log: {
      displayName: "log",
      type: "number",
      requiresFeature: "advanced-math-expressions",
      description: () => t`Returns the base 10 log of the number.`,
      args: () => [
        {
          name: t`column`,
          type: "number",
          description: t`The column or number to return the natural logarithm value of.`,
          example: dimension(t`Value`),
        },
      ],
    },
    exp: {
      displayName: "exp",
      type: "number",
      requiresFeature: "advanced-math-expressions",
      description: () =>
        t`Returns Euler's number, e, raised to the power of the supplied number.`,
      args: () => [
        {
          name: t`column`,
          type: "number",
          description: t`The column or number to return the exponential value of.`,
          example: dimension(t`Interest Months`),
        },
      ],
    },
  },
);

const LOGICAL = defineClauses(
  { category: CATEGORY.Logical },
  {
    between: {
      displayName: "between",
      type: "boolean",
      description: () =>
        t`Checks a date or number column's values to see if they're within the specified range.`,
      args: () => [
        {
          name: t`column`,
          type: "expression",
          description: t`The date or numeric column that should be within the start and end values.`,
          example: dimension(t`Created At`),
        },
        {
          name: t`start`,
          type: "expression",
          description: t`The beginning of the range.`,
          example: "2019-01-01",
        },
        {
          name: t`end`,
          type: "expression",
          description: t`The end of the range.`,
          example: "2022-12-31",
        },
      ],
    },
    "is-null": {
      displayName: "isNull",
      type: "boolean",
      description: () => t`Checks if a column is null`,
      args: () => [
        {
          name: t`column`,
          type: "expression",
          description: t`The column to check.`,
          example: dimension(t`Discount`),
        },
      ],
      docsPage: "isnull",
    },
    "not-null": {
      displayName: "notNull",
      type: "boolean",
      description: () => t`Checks if a column is not null`,
      args: () => [
        {
          name: t`column`,
          type: "expression",
          description: t`The column to check.`,
          example: dimension(t`Discount`),
        },
      ],
    },
    coalesce: {
      displayName: "coalesce",
      type: "expression",
      argType(_index, _args, type) {
        return type;
      },
      multiple: true,
      description: () =>
        t`Looks at the values in each argument in order and returns the first non-null value for each row.`,
      args: () => [
        {
          name: t`value1`,
          type: "expression",
          description: t`The column or value to return.`,
          example: dimension(t`Comments`),
        },
        {
          name: t`value2`,
          type: "expression",
          description: t`If \`$value1\` is empty, \`$value2\` gets returned if its not empty.`,
          example: dimension(t`Notes`),
        },
        {
          name: "…",
          type: "expression",
          optional: true,
          description: t`If \`$value1\` is empty, and \`$value2\` is empty, the next non-empty one will be returned.`,
          example: t`No comments`,
        },
      ],
      docsPage: "coalesce",
    },
    case: {
      displayName: "case",
      type: "expression",
      multiple: true,
      argType(index, args, type) {
        const len = args.length;
        if (len % 2 === 1 && index === len - 1) {
          return type;
        }
        if (index % 2 === 1) {
          return type;
        }
        return "boolean";
      },
      description: () =>
        t`Alias for \`if()\`. Tests an expression against a list of cases and returns the corresponding value of the first matching case, with an optional default value if nothing else is met.`,
      args: () => [
        {
          name: t`condition`,
          type: "expression",
          description: t`Something that should evaluate to \`true\` or \`false\`.`,
          example: op(">", dimension(t`Weight`), 200),
        },
        {
          name: t`output`,
          type: "expression",
          description: t`The value that will be returned if the preceding condition is \`true\`.`,
          example: t`Large`,
        },
        {
          name: "…",
          type: "expression",
          optional: true,
          description: t`You can add more conditions to test.`,
          example: [op(">", dimension(t`Weight`), 150), t`Medium`, t`Small`],
        },
      ],
      docsPage: "case",
    },
    if: {
      displayName: "if",
      type: "expression",
      multiple: true,
      argType(index, args, type) {
        const len = args.length;
        if (len % 2 === 1 && index === len - 1) {
          return type;
        }
        if (index % 2 === 1) {
          return type;
        }
        return "boolean";
      },
      description: () =>
        t`Alias for \`case()\`. Tests an expression against a list of cases and returns the corresponding value of the first matching case, with an optional default value if nothing else is met.`,
      args: () => [
        {
          name: t`condition`,
          type: "expression",
          description: t`Something that should evaluate to \`true\` or \`false\`.`,
          example: op(">", dimension(t`Weight`), 200),
        },
        {
          name: t`output`,
          type: "expression",
          description: t`The value that will be returned if the preceding condition is \`true\`.`,
          example: t`Large`,
        },
        {
          name: "…",
          type: "expression",
          optional: true,
          description: t`You can add more conditions to test.`,
          example: [op(">", dimension(t`Weight`), 150), t`Medium`, t`Small`],
        },
      ],
    },
    //"in` and `not-in` are aliases for `=` and `!="
    in: {
      displayName: "in",
      type: "boolean",
      multiple: true,
      description: () =>
        t`Returns true if \`value1\` equals \`$value2\` (or \`$value3\`, etc. if specified).`,
      args: () => [
        {
          name: t`value1`,
          type: "expression",
          description: t`The column or value to check.`,
          example: dimension(t`Category`),
        },
        {
          name: t`value2`,
          type: "expression",
          description: t`The column or value to look for.`,
          example: "Widget",
        },
        {
          name: "…",
          type: "expression",
          description: t`You can add more values to look for.`,
          example: "Gadget",
          optional: true,
        },
      ],
      docsPage: "in",
    },
    "not-in": {
      displayName: "notIn",
      type: "boolean",
      multiple: true,
      description: () =>
        t`Returns true if \`$value1\` doesn't equal \`$value2\` (and \`$value3\`, etc. if specified).`,
      args: () => [
        {
          name: t`value1`,
          type: "expression",
          description: t`The column or value to check.`,
          example: dimension(t`Category`),
        },
        {
          name: t`value2`,
          type: "expression",
          description: t`The column or value to look for.`,
          example: "Widget",
        },
        {
          name: "…",
          type: "expression",
          description: t`You can add more values to look for.`,
          example: "Gadget",
          optional: true,
        },
      ],
    },
  },
);

const LOGICAL_OPERATORS = defineClauses(
  {},
  {
    and: {
      displayName: "AND",
      type: "boolean",
      multiple: true,
      args: () => [
        {
          name: "arg1",
          type: "boolean",
        },
        {
          name: "arg2",
          type: "boolean",
        },
      ],
      argType() {
        return "boolean";
      },
    },
    or: {
      displayName: "OR",
      type: "boolean",
      multiple: true,
      args: () => [
        {
          name: "arg1",
          type: "boolean",
        },
        {
          name: "arg2",
          type: "boolean",
        },
      ],
      argType() {
        return "boolean";
      },
    },
    not: {
      displayName: "NOT",
      type: "boolean",
      args: () => [
        {
          name: "arg",
          type: "boolean",
        },
      ],
    },
  },
);

const NUMERIC_OPERATORS = defineClauses(
  {},
  {
    "*": {
      displayName: "*",
      type: "number",
      args: () => [
        {
          name: "number1",
          type: "number",
        },
        {
          name: "number2",
          type: "number",
        },
      ],
      multiple: true,
      argType(_index, _args, type) {
        if (type === "aggregation") {
          return "aggregation";
        }
        return "number";
      },
    },
    "/": {
      displayName: "/",
      type: "number",
      args: () => [
        {
          name: "number1",
          type: "number",
        },
        {
          name: "number2",
          type: "number",
        },
      ],
      multiple: true,
      argType(_index, _args, type) {
        if (type === "aggregation") {
          return "aggregation";
        }
        return "number";
      },
    },
    "-": {
      displayName: "-",
      type: "number",
      args: () => [
        {
          name: "number1",
          type: "number",
        },
        {
          name: "number2",
          type: "number",
        },
      ],
      multiple: true,
      argType(_index, _args, type) {
        if (type === "aggregation") {
          return "aggregation";
        }
        return "number";
      },
    },
    "+": {
      displayName: "+",
      type: "number",
      args: () => [
        {
          name: "number1",
          type: "number",
        },
        {
          name: "number2",
          type: "number",
        },
      ],
      multiple: true,
      argType(_index, _args, type) {
        if (type === "aggregation") {
          return "aggregation";
        }
        return "number";
      },
    },
  },
);

const EQUALITY_OPERATORS = defineClauses(
  {},
  {
    "=": {
      displayName: "=",
      type: "boolean",
      args: () => [
        {
          name: "arg1",
          type: "expression",
        },
        {
          name: "arg2",
          type: "expression",
        },
      ],
    },
    "!=": {
      displayName: "!=",
      type: "boolean",
      args: () => [
        {
          name: "arg1",
          type: "expression",
        },
        {
          name: "arg2",
          type: "expression",
        },
      ],
    },
  },
);

export const COMPARISON_OPERATORS = defineClauses(
  {},
  {
    "<=": {
      displayName: "<=",
      type: "boolean",
      args: () => [
        {
          name: "arg1",
          type: "expression",
        },
        {
          name: "arg2",
          type: "expression",
        },
      ],
    },
    ">=": {
      displayName: ">=",
      type: "boolean",
      args: () => [
        {
          name: "arg1",
          type: "expression",
        },
        {
          name: "arg2",
          type: "expression",
        },
      ],
    },
    "<": {
      displayName: "<",
      type: "boolean",
      args: () => [
        {
          name: "arg1",
          type: "expression",
        },
        {
          name: "arg2",
          type: "expression",
        },
      ],
    },
    ">": {
      displayName: ">",
      type: "boolean",
      args: () => [
        {
          name: "arg1",
          type: "expression",
        },
        {
          name: "arg2",
          type: "expression",
        },
      ],
    },
  },
);

export const EXPRESSION_OPERATORS = {
  ...LOGICAL_OPERATORS,
  ...NUMERIC_OPERATORS,
  ...EQUALITY_OPERATORS,
  ...COMPARISON_OPERATORS,
} as const;

export const EXPRESSION_FUNCTIONS = {
  ...CONVERSION,
  ...STRING,
  ...DATE,
  ...MATH,
  ...LOGICAL,
} as const;

export const AGGREGATION_FUNCTIONS = {
  ...EXPRESSION_FUNCTIONS,
  ...AGGREGATION,
  ...WINDOW,
} as const;

export const MBQL_CLAUSES = {
  ...AGGREGATION_FUNCTIONS,
  ...EXPRESSION_FUNCTIONS,
  ...EXPRESSION_OPERATORS,
} as const;
