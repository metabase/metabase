import { t } from "ttag";

import { dayjs } from "metabase/dayjs";
import type * as Lib from "metabase-lib";

import { defineClauses, dimension, op } from "./define";
import { MBQLClauseCategory as CATEGORY } from "./types";

const WINDOW = defineClauses(
  { category: CATEGORY.Window },
  {
    "cum-count": {
      displayName: "CumulativeCount",
      type: "aggregation",
      description: () =>
        t`Counts rows as a running total across groups, such as months.`,
      docsPage: "cumulative",
      args: () => [],
    },
    "cum-sum": {
      displayName: "CumulativeSum",
      type: "aggregation",
      description: () =>
        t`Adds up a column as a running total across groups, such as months.`,
      args: () => [
        {
          name: t`column`,
          type: "number",
          description: t`The column or number to add up.`,
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
        t`Gets the value of a summary from another row, such as the previous month.`,
      args: () => [
        {
          name: t`expression`,
          type: "any",
          description: t`The summary to get from the other row, such as \`Sum([Total])\`.`,
          example: op("sum", dimension(t`Total`)),
        },
        {
          name: t`rowOffset`,
          type: "number",
          description: t`How many rows to move. \`-1\` is the previous row and \`1\` is the next.`,
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
      description: () => t`Counts the rows in your data.`,
      args: () => [],
    },
    sum: {
      displayName: "Sum",
      type: "aggregation",
      description: () => t`Adds up all the values in a column.`,
      args: () => [
        {
          name: t`column`,
          type: "number",
          description: t`The column or number to add up.`,
          example: dimension(t`Subtotal`),
        },
      ],
    },
    distinct: {
      displayName: "Distinct",
      type: "aggregation",
      description: () =>
        t`Counts the different values in a column. Repeats only count once.`,
      args: () => [
        {
          name: t`column`,
          type: "expression",
          description: t`The column to count different values in.`,
          example: dimension(t`Last Name`),
        },
      ],
    },
    stddev: {
      displayName: "StandardDeviation",
      type: "aggregation",
      requiresFeature: "standard-deviation-aggregations",
      description: () =>
        t`Measures how spread out the values in a column are. A low number means they're close to the average.`,
      args: () => [
        {
          name: t`column`,
          type: "number",
          description: t`The number column to measure.`,
          example: dimension(t`Population`),
        },
      ],
    },
    avg: {
      displayName: "Average",
      type: "aggregation",
      description: () => t`Finds the average of the values in a column.`,
      args: () => [
        {
          name: t`column`,
          type: "number",
          description: t`The number column to average.`,
          example: dimension(t`Quantity`),
        },
      ],
    },
    median: {
      displayName: "Median",
      type: "aggregation",
      requiresFeature: "percentile-aggregations",
      description: () =>
        t`Finds the middle value in a column: half the values are higher and half are lower.`,
      args: () => [
        {
          name: t`column`,
          type: "number",
          description: t`The number column to find the middle value of.`,
          example: dimension(t`Quantity`),
        },
      ],
    },
    min: {
      displayName: "Min",
      type: "aggregation",
      description: () => t`Finds the smallest value in a column.`,
      args: () => [
        {
          name: t`column`,
          type: "expression",
          description: t`The column to find the smallest value in.`,
          example: dimension(t`Salary`),
        },
      ],
    },
    max: {
      displayName: "Max",
      type: "aggregation",
      description: () => t`Finds the largest value in a column.`,
      args: () => [
        {
          name: t`column`,
          type: "expression",
          description: t`The column to find the largest value in.`,
          example: dimension(t`Age`),
        },
      ],
    },
    share: {
      displayName: "Share",
      type: "aggregation",
      description: () =>
        t`Gives the share of rows that match a condition, as a decimal. For example, \`0.25\` means 25%.`,
      args: () => [
        {
          name: t`condition`,
          type: "boolean",
          description: t`A check that's either \`true\` or \`false\`.`,
          example: op("=", dimension(t`Source`), "Google"),
        },
      ],
    },
    "count-where": {
      displayName: "CountIf",
      type: "aggregation",
      description: () => t`Counts the rows that match a condition.`,
      args: () => [
        {
          name: t`condition`,
          type: "boolean",
          description: t`A check that's either \`true\` or \`false\`.`,
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
        t`Counts the different values in a column, using only the rows that match a condition.`,
      args: () => [
        {
          name: t`column`,
          type: "number",
          description: t`The column to count different values in.`,
          example: dimension(t`Customer ID`),
        },
        {
          name: t`condition`,
          type: "boolean",
          description: t`A check that's either \`true\` or \`false\`.`,
          example: op("=", dimension(t`Order Status`), "Completed"),
        },
      ],
    },
    "sum-where": {
      displayName: "SumIf",
      type: "aggregation",
      description: () =>
        t`Adds up the values in a column, using only the rows that match a condition.`,
      args: () => [
        {
          name: t`column`,
          type: "number",
          description: t`The number column to add up.`,
          example: dimension(t`Subtotal`),
        },
        {
          name: t`condition`,
          type: "boolean",
          description: t`A check that's either \`true\` or \`false\`.`,
          example: op("=", dimension(t`Order Status`), "Valid"),
        },
      ],
      docsPage: "sumif",
    },
    var: {
      displayName: "Variance",
      type: "aggregation",
      requiresFeature: "standard-deviation-aggregations",
      description: () =>
        t`Measures how far the values in a column are from their average, using squared differences.`,
      args: () => [
        {
          name: t`column`,
          type: "number",
          description: t`The column or number to measure.`,
          example: dimension(t`Temperature`),
        },
      ],
    },
    percentile: {
      displayName: "Percentile",
      type: "aggregation",
      requiresFeature: "percentile-aggregations",
      description: () =>
        t`Finds the value that a given share of the column falls below. For example, \`0.9\` gives the value that 90% of rows fall below.`,
      args: () => [
        {
          name: t`column`,
          type: "number",
          description: t`The column or number to use.`,
          example: dimension(t`Score`),
        },
        {
          name: t`percentile-value`,
          type: "number",
          description: t`A decimal between \`0\` and \`1\`. For example, \`0.9\` for the 90th percentile.`,
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
        t`Turns a number or date into text, so you can filter it as text or join it with text columns.`,
      args: () => [
        {
          name: t`value`,
          type: "expression",
          description: t`The number or date to turn into text.`,
          example: dimension("User ID"),
        },
      ],
    },
    integer: {
      displayName: "integer",
      type: "number",
      requiresFeature: "expressions/integer",
      description: () =>
        t`Turns text or a decimal number into a whole number. Decimals are rounded.`,
      args: () => [
        {
          name: t`value`,
          type: "expression",
          description: t`The text or decimal column to convert. Text must be a whole number.`,
          example: dimension("User ID"),
        },
      ],
    },
    date: {
      displayName: "date",
      type: "datetime",
      requiresFeature: "expressions/date",
      description: () =>
        t`Turns text or a date and time into a date, dropping the time.`,
      args: () => [
        {
          name: t`value`,
          type: "expression",
          description: t`The text or date and time to convert. Text must be in a format like \`"2025-03-20"\`.`,
          example: "2025-03-20",
        },
      ],
    },
    datetime: {
      displayName: "datetime",
      type: "datetime",
      requiresFeature: "expressions/datetime",
      description: () => t`Turns text or bytes into a date and time.`,
      hasOptions: true,
      args: () => [
        {
          name: t`value`,
          type: "expression",
          description: t`The text, bytes, or number to convert.`,
          example: "2025-03-20 12:45:04",
        },
        {
          name: t`mode`,
          type: "string",
          description: t`How the value is stored. One of: \`"simple"\`, \`"iso"\`, \`"simpleBytes"\`, \`"isoBytes"\`, \`"unixSeconds"\`, \`"unixMilliseconds"\`, \`"unixMicroseconds"\`, \`"unixNanoseconds"\`. Default is \`"iso"\`.`,
          optional: true,
        },
      ],
    },
    today: {
      displayName: "today",
      type: "datetime",
      requiresFeature: "expressions/today",
      description: () => t`Gives today's date.`,
      args: () => [],
    },
    float: {
      displayName: "float",
      type: "number",
      requiresFeature: "expressions/float",
      description: () => t`Turns text into a decimal number.`,
      args: () => [
        {
          name: t`value`,
          type: "expression",
          description: t`The text column to convert.`,
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
      description: () => t`Changes text to lower case.`,
      args: () => [
        {
          name: t`value`,
          type: "string",
          description: t`The column with the text to change.`,
          example: dimension(t`Status`),
        },
      ],
    },
    upper: {
      displayName: "upper",
      type: "string",
      description: () => t`Changes text to upper case.`,
      args: () => [
        {
          name: t`value`,
          type: "string",
          description: t`The column with the text to change.`,
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
      description: () =>
        t`Gets part of a text, starting at the position you choose.`,
      args: () => [
        {
          name: t`value`,
          type: "string",
          description: t`The column or text to take part of.`,
          example: dimension(t`Title`),
        },
        {
          name: t`position`,
          type: "number",
          description: t`Where to start. The first character is \`1\`.`,
          example: 1,
        },
        {
          name: t`length`,
          type: "number",
          description: t`How many characters to keep.`,
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
        t`Splits text wherever a separator appears and gives you one of the pieces.`,
      args: () => [
        {
          name: t`text`,
          type: "string",
          description: t`The column or text to split.`,
          example: dimension(t`Title`),
        },
        {
          name: t`delimiter`,
          type: "string",
          description: t`The text that marks each split, such as a comma.`,
          example: ",",
        },
        {
          name: t`position`,
          type: "number",
          description: t`Which piece to keep. The first piece is \`1\`.`,
          example: 1,
        },
      ],
    },
    collate: {
      displayName: "collate",
      type: "string",
      requiresFeature: "collate",
      description: () =>
        t`Sets the language rules used to sort and compare text.`,
      args: () => [
        {
          name: t`value`,
          type: "string",
          description: t`The column or text to apply the rules to.`,
          example: dimension(t`Name`),
        },
        {
          name: t`collation`,
          type: "string",
          description: t`The name of the rules to use.`,
          example: t`en-ci-ai`,
        },
      ],
    },
    "regex-match-first": {
      displayName: `regexExtract`,
      type: "string",
      requiresFeature: "regex",
      description: () =>
        t`Gets the first part of a text that matches a pattern, written as a regular expression.`,
      args: () => [
        {
          name: t`value`,
          type: "string",
          description: t`The column or text to search.`,
          example: dimension(t`Address`),
        },
        {
          name: t`regular_expression`,
          type: "string",
          description: t`The pattern to look for.`,
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
        t`Gets the page path from a URL. For example, \`${'"/pricing"'}\` from \`${'"https://www.example.com/pricing"'}\`.`,
      args: () => [
        {
          name: t`url`,
          type: "string",
          description: t`The column with URLs.`,
          example: dimension(t`URL`),
        },
      ],
    },
    concat: {
      displayName: "concat",
      type: "string",
      multiple: true,
      description: () => t`Joins two or more pieces of text together.`,
      args: () => [
        {
          name: t`value1`,
          type: "expression",
          description: t`The column or text to start with.`,
          example: dimension(t`Last Name`),
        },
        {
          name: t`value2`,
          type: "expression",
          description: t`The column or text to add after \`$value1\`.`,
          example: ", ",
        },
        {
          name: "…",
          type: "string",
          description: t`Keep adding as many as you need.`,
          example: dimension(t`First Name`),
          optional: true,
        },
      ],
      docsPage: "concat",
    },
    replace: {
      displayName: "replace",
      type: "string",
      description: () =>
        t`Replaces text with other text, everywhere it appears.`,
      args: () => [
        {
          name: t`value`,
          type: "string",
          description: t`The column or text to search.`,
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
          description: t`The text to put in its place.`,
          example: t`Gigantic`,
        },
      ],
    },
    length: {
      displayName: "length",
      type: "number",
      description: () => t`Counts the characters in a text.`,
      args: () => [
        {
          name: t`value`,
          type: "string",
          description: t`The column or text to measure.`,
          example: dimension(t`Comment`),
        },
      ],
    },
    trim: {
      displayName: "trim",
      type: "string",
      description: () => t`Removes spaces from the start and end of a text.`,
      args: () => [
        {
          name: t`value`,
          type: "string",
          description: t`The column or text to clean up.`,
          example: dimension(t`Comment`),
        },
      ],
    },
    rtrim: {
      displayName: "rTrim",
      type: "string",
      description: () => t`Removes spaces from the end of a text.`,
      args: () => [
        {
          name: t`value`,
          type: "string",
          description: t`The column or text to clean up.`,
          example: dimension(t`Comment`),
        },
      ],
    },
    ltrim: {
      displayName: "lTrim",
      type: "string",
      description: () => t`Removes spaces from the start of a text.`,
      args: () => [
        {
          name: t`value`,
          type: "string",
          description: t`The column or text to clean up.`,
          example: dimension(t`Comment`),
        },
      ],
    },
    domain: {
      displayName: "domain",
      type: "string",
      requiresFeature: "regex/lookaheads-and-lookbehinds",
      description: () =>
        t`Gets the domain name from a URL or email, such as \`"metabase"\`.`,
      args: () => [
        {
          name: t`urlOrEmail`,
          type: "string",
          description: t`The column with URLs or emails.`,
          example: dimension(t`Email`),
        },
      ],
    },
    subdomain: {
      displayName: "subdomain",
      type: "string",
      requiresFeature: "regex/lookaheads-and-lookbehinds",
      description: () =>
        t`Gets the subdomain from a URL, such as \`"status"\` from \`"status.metabase.com"\`. Ignores \`"www"\`.`,
      args: () => [
        {
          name: t`url`,
          type: "string",
          description: t`The column with URLs.`,
          example: dimension(t`ProfileImage`),
        },
      ],
    },
    host: {
      displayName: "host",
      type: "string",
      requiresFeature: "regex/lookaheads-and-lookbehinds",
      description: () =>
        t`Gets the domain name and its ending from a URL or email, such as \`"metabase.com"\` from \`"status.metabase.com"\`.`,
      args: () => [
        {
          name: t`urlOrEmail`,
          type: "string",
          description: t`The column with URLs or emails.`,
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
        t`Checks whether text includes any of the words you're looking for.`,
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
          description: t`The text to look for.`,
          example: t`Small`,
        },
        {
          name: "…",
          description: t`Add more text to look for.`,
          example: t`Medium`,
          type: "string",
          optional: true,
        },
        {
          name: "caseSensitivity",
          type: "string",
          description: t`Optional. Use \`"case-insensitive"\` to ignore upper and lower case.`,
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
        t`Checks that text includes none of the words you're looking for.`,
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
          description: t`The text to look for.`,
          example: t`Small`,
        },
        {
          name: "…",
          description: t`Add more text to look for.`,
          example: t`Medium`,
          type: "string",
          optional: true,
        },
        {
          name: "caseSensitivity",
          description: t`Optional. Use \`"case-insensitive"\` to ignore upper and lower case.`,
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
        t`Checks whether text starts with any of the words you're looking for.`,
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
          description: t`The text to look for.`,
          example: t`Small`,
        },
        {
          name: "…",
          type: "string",
          description: t`Add more text to look for.`,
          example: t`Medium`,
          optional: true,
        },
        {
          name: "caseSensitivity",
          type: "string",
          description: t`Optional. Use \`"case-insensitive"\` to ignore upper and lower case.`,
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
        t`Checks whether text ends with any of the words you're looking for.`,
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
          description: t`The text to look for.`,
          example: t`Small`,
        },
        {
          name: "…",
          type: "string",
          description: t`Add more text to look for.`,
          example: t`Medium`,
          optional: true,
        },
        {
          name: "caseSensitivity",
          description: t`Optional. Use \`"case-insensitive"\` to ignore upper and lower case.`,
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
      description: () => t`Checks whether text is blank or missing.`,
      args: () => [
        {
          name: t`column`,
          type: "expression",
          description: t`The text column to check.`,
          example: dimension(t`Name`),
        },
      ],
      docsPage: "isempty",
    },
    "not-empty": {
      displayName: "notEmpty",
      type: "boolean",
      description: () => t`Checks that text isn't blank or missing.`,
      args: () => [
        {
          name: t`column`,
          type: "expression",
          description: t`The text column to check.`,
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
        t`Gives a month's short name in your language, such as \`"Apr"\` for \`4\`.`,
      args: () => [
        {
          name: t`monthNumber`,
          type: "number",
          description: t`A column or calculation with the month number, \`1\` to \`12\`.`,
          example: dimension(t`Birthday Month`),
        },
      ],
    },
    "quarter-name": {
      displayName: "quarterName",
      type: "string",
      description: () =>
        t`Gives a quarter as text, such as \`"Q1"\` for \`1\`.`,
      args: () => [
        {
          name: t`quarterNumber`,
          type: "number",
          description: t`A column or calculation with the quarter number, \`1\` to \`4\`.`,
          example: dimension(t`Fiscal Quarter`),
        },
      ],
    },
    "day-name": {
      displayName: "dayName",
      type: "string",
      description: () =>
        t`Gives the name of a weekday in your language, from its number.`,
      args: () => [
        {
          name: t`dayNumber`,
          type: "number",
          description: t`A column or calculation with the day number, \`1\` to \`7\`. Your localization settings decide which day is \`1\`. The default is Sunday.`,
          example: dimension(t`Weekday`),
        },
      ],
    },
    interval: {
      displayName: "timeSpan",
      type: "number",
      description: () =>
        t`Creates a length of time, such as 7 days, to add to or subtract from a date.`,
      args: () => [
        {
          name: t`number`,
          type: "number",
          description: t`How many units. Use a whole number. Negative numbers go back in time.`,
          example: 7,
        },
        {
          name: t`unit`,
          type: "string",
          description: t`The unit of time, such as ${"day"}, ${"month"}, or ${"year"}.`,
          example: "day",
        },
      ],
    },
    "time-interval": {
      displayName: "interval",
      type: "boolean",
      hasOptions: true,
      description: () =>
        t`Checks whether a date falls in a period relative to now, such as the last 30 days.`,
      args: () => [
        {
          name: t`column`,
          type: "expression",
          description: t`The date column to check.`,
          example: dimension(t`Created At`),
        },
        {
          name: t`number`,
          type: "number",
          description: t`How many units. Use a whole number. Negative numbers go back in time.`,
          example: -1,
        },
        {
          name: t`unit`,
          type: "string",
          description: t`The unit of time, such as ${"day"}, ${"month"}, or ${"year"}.`,
          example: "month",
        },
      ],
    },
    "relative-time-interval": {
      displayName: "intervalStartingFrom",
      type: "boolean",
      description: () =>
        t`Checks whether a date falls in a period that begins at a distance from now, such as the 20 months before 10 years ago.`,
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
          description: t`How many units. Use a whole number. Negative numbers go back in time.`,
          example: -20,
        },
        {
          name: t`unit`,
          type: "string",
          description: t`The unit of time, such as ${"day"}, ${"month"}, or ${"year"}.`,
          example: "month",
        },
        {
          name: t`offsetValue`,
          type: "number",
          description: t`How far from now the period starts. Negative numbers go back in time.`,
          example: -10,
        },
        {
          name: t`offsetUnit`,
          type: "string",
          description: t`The unit of time for \`$offsetValue\`, such as ${"day"}, ${"month"}, or ${"year"}.`,
          example: "year",
        },
      ],
    },
    "relative-datetime": {
      displayName: "relativeDateTime",
      type: "expression",
      description: () =>
        t`Gets a point in time counted from now, such as 30 days ago. Rounds down to the unit you choose.`,
      args: () => [
        {
          name: t`number`,
          type: "number",
          description: t`How many units. Use a whole number. Negative numbers go back in time.`,
          example: -30,
        },
        {
          name: t`unit`,
          type: "string",
          description: t`The unit of time, such as ${"day"}, ${"month"}, or ${"year"}.`,
          example: "day",
        },
      ],
    },
    "get-year": {
      displayName: "year",
      type: "number",
      description: () => t`Gets the year from a date.`,
      args: () => [
        {
          name: t`column`,
          type: "datetime",
          description: t`The date column.`,
          example: dimension(t`Created At`),
        },
      ],
    },
    "get-quarter": {
      displayName: "quarter",
      type: "number",
      description: () =>
        t`Gets the quarter from a date, as a number from \`1\` to \`4\`.`,
      args: () => [
        {
          name: t`column`,
          type: "datetime",
          description: t`The date column.`,
          example: dimension(t`Created At`),
        },
      ],
    },
    "get-month": {
      displayName: "month",
      type: "number",
      description: () =>
        t`Gets the month from a date, as a number from \`1\` to \`12\`.`,
      args: () => [
        {
          name: t`column`,
          type: "datetime",
          description: t`The date column.`,
          example: dimension(t`Created At`),
        },
      ],
    },
    "get-week": {
      displayName: "week",
      type: "number",
      hasOptions: true, // optional mode parameter
      description: () => t`Gets the week of the year from a date, as a number.`,
      args: () => [
        {
          name: t`column`,
          type: "datetime",
          description: t`The date column.`,
          example: dimension(t`Created At`),
        },
        {
          name: t`mode`,
          type: "string",
          optional: true,
          description:
            // TODO: This is the only place that's not easy to replace the application name.
            // eslint-disable-next-line metabase/no-literal-metabase-strings -- Hard to replace the application name because it's not a React component
            t`Optional. How weeks are counted. The default is \`"ISO"\`.
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
        t`Gets the day of the month from a date, as a number from \`1\` to \`31\`.`,
      args: () => [
        {
          name: t`column`,
          type: "datetime",
          description: t`The date column.`,
          example: dimension(t`Created At`),
        },
      ],
    },
    "get-day-of-week": {
      displayName: "weekday",
      type: "number",
      hasOptions: true, // optional mode parameter
      description: () =>
        t`Gets the day of the week from a date, as a number from \`1\` to \`7\`. Your localization settings decide which day is \`1\`.`,
      args: () => [
        {
          name: t`column`,
          type: "datetime",
          description: t`The date column.`,
          example: dimension(t`Created At`),
        },
      ],
    },
    "get-hour": {
      displayName: "hour",
      type: "number",
      description: () =>
        t`Gets the hour from a date and time, as a number from \`0\` to \`23\`.`,
      args: () => [
        {
          name: t`column`,
          type: "datetime",
          description: t`The date column.`,
          example: dimension(t`Created At`),
        },
      ],
    },
    "get-minute": {
      displayName: "minute",
      type: "number",
      description: () =>
        t`Gets the minutes from a date and time, as a number from \`0\` to \`59\`.`,
      args: () => [
        {
          name: t`column`,
          type: "datetime",
          description: t`The date column.`,
          example: dimension(t`Created At`),
        },
      ],
    },
    "get-second": {
      displayName: "second",
      type: "number",
      description: () =>
        t`Gets the seconds from a date and time, as a number from \`0\` to \`59\`.`,
      args: () => [
        {
          name: t`column`,
          type: "datetime",
          description: t`The date column.`,
          example: dimension(t`Created At`),
        },
      ],
    },
    "datetime-diff": {
      displayName: "datetimeDiff",
      type: "number",
      requiresFeature: "datetime-diff",
      description: () =>
        t`Counts the time from \`$datetime1\` to \`$datetime2\`, in the unit you choose.`,
      args: () => [
        {
          name: t`datetime1`,
          type: "datetime",
          description: t`The start date. Can be a column or calculation.`,
          example: dimension(t`Created At`),
        },
        {
          name: t`datetime2`,
          type: "datetime",
          description: t`The end date. Can be a column or calculation.`,
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
      description: () => t`Adds an amount of time to a date.`,
      args: () => [
        {
          name: t`column`,
          type: "datetime",
          description: t`The column with your dates.`,
          example: dimension(t`Created At`),
        },
        {
          name: t`amount`,
          type: "number",
          description: t`How many units to add. Use a whole number.`,
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
      description: () => t`Subtracts an amount of time from a date.`,
      args: () => [
        {
          name: t`column`,
          type: "datetime",
          description: t`The column with your dates.`,
          example: dimension(t`Created At`),
        },
        {
          name: t`amount`,
          type: "number",
          description: t`How many units to subtract. Use a whole number.`,
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
          return t`Gives the current date and time.`;
        } else {
          return t`Gives the current date and time. Currently ${nowAtTimezone} in ${timezone}.`;
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
      description: () => t`Changes a date and time to another time zone.`,
      args: () => [
        {
          name: t`column`,
          type: "datetime",
          description: t`The column with your dates and times.`,
          example: dimension(t`Created At`),
        },
        {
          name: t`target`,
          type: "string",
          description: t`The time zone to change to. Use a name like \`"Canada/Pacific"\`.`,
          example: "Asia/Ho_Chi_Minh",
        },
        {
          name: t`source`,
          type: "string",
          description: t`The time zone it's in now. Only needed when your dates don't include a time zone.`,
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
        t`Removes the minus sign from a number, so it's always positive.`,
      args: () => [
        {
          name: t`column`,
          type: "number",
          description: t`The column or number to make positive.`,
          example: dimension(t`Debt`),
        },
      ],
    },
    floor: {
      displayName: "floor",
      type: "number",
      requiresFeature: "expressions",
      description: () => t`Rounds a number down to a whole number.`,
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
      description: () => t`Rounds a number up to a whole number.`,
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
      description: () => t`Rounds a number to the nearest whole number.`,
      args: () => [
        {
          name: t`column`,
          type: "number",
          description: t`The column or number to round.`,
          example: dimension(t`Temperature`),
        },
      ],
    },
    sqrt: {
      displayName: "sqrt",
      type: "number",
      requiresFeature: "advanced-math-expressions",
      description: () => t`Gets the square root of a number.`,
      args: () => [
        {
          name: t`column`,
          type: "number",
          description: t`The column or number to get the square root of.`,
          example: dimension(t`Hypotenuse`),
        },
      ],
    },
    power: {
      displayName: "power",
      type: "number",
      requiresFeature: "advanced-math-expressions",
      description: () =>
        t`Raises a number to a power. For example, \`3\` to the power of \`2\` is \`9\`.`,
      args: () => [
        {
          name: t`column`,
          type: "number",
          description: t`The column or number to raise.`,
          example: dimension(t`Length`),
        },
        {
          name: t`exponent`,
          type: "number",
          description: t`The power to raise it to.`,
          example: 2,
        },
      ],
    },
    log: {
      displayName: "log",
      type: "number",
      requiresFeature: "advanced-math-expressions",
      description: () => t`Gets the base 10 logarithm of a number.`,
      args: () => [
        {
          name: t`column`,
          type: "number",
          description: t`The column or number to get the logarithm of.`,
          example: dimension(t`Value`),
        },
      ],
    },
    exp: {
      displayName: "exp",
      type: "number",
      requiresFeature: "advanced-math-expressions",
      description: () => t`Raises e (about 2.718) to the power of a number.`,
      args: () => [
        {
          name: t`column`,
          type: "number",
          description: t`The power to raise e to. Can be a column or number.`,
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
        t`Checks whether a date or number falls within a range, including both ends.`,
      args: () => [
        {
          name: t`column`,
          type: "expression",
          description: t`The date or number column to check.`,
          example: dimension(t`Created At`),
        },
        {
          name: t`start`,
          type: "expression",
          description: t`Where the range starts.`,
          example: "2019-01-01",
        },
        {
          name: t`end`,
          type: "expression",
          description: t`Where the range ends.`,
          example: "2022-12-31",
        },
      ],
    },
    "is-null": {
      displayName: "isNull",
      type: "boolean",
      description: () => t`Checks whether a value is missing.`,
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
      description: () => t`Checks that a value isn't missing.`,
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
        t`Gives the first value that isn't missing, checking from left to right.`,
      args: () => [
        {
          name: t`value1`,
          type: "expression",
          description: t`The first column or value to try.`,
          example: dimension(t`Comments`),
        },
        {
          name: t`value2`,
          type: "expression",
          description: t`Used if \`$value1\` is missing.`,
          example: dimension(t`Notes`),
        },
        {
          name: "…",
          type: "expression",
          optional: true,
          description: t`Add more values to try, in order.`,
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
        t`Checks conditions in order and gives the result for the first one that's true. You can end with a fallback result for when none are true. Same as \`if()\`.`,
      args: () => [
        {
          name: t`condition`,
          type: "expression",
          description: t`A check that's either \`true\` or \`false\`.`,
          example: op(">", dimension(t`Weight`), 200),
        },
        {
          name: t`output`,
          type: "expression",
          description: t`The result to give if this condition is \`true\`.`,
          example: t`Large`,
        },
        {
          name: "…",
          type: "expression",
          optional: true,
          description: t`Add more conditions and results. End with a single value to use as a fallback.`,
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
        t`Checks conditions in order and gives the result for the first one that's true. You can end with a fallback result for when none are true. Same as \`case()\`.`,
      args: () => [
        {
          name: t`condition`,
          type: "expression",
          description: t`A check that's either \`true\` or \`false\`.`,
          example: op(">", dimension(t`Weight`), 200),
        },
        {
          name: t`output`,
          type: "expression",
          description: t`The result to give if this condition is \`true\`.`,
          example: t`Large`,
        },
        {
          name: "…",
          type: "expression",
          optional: true,
          description: t`Add more conditions and results. End with a single value to use as a fallback.`,
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
        t`Checks whether a value matches any of the values you list.`,
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
          description: t`Add more values to look for.`,
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
        t`Checks that a value matches none of the values you list.`,
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
          description: t`Add more values to look for.`,
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

export type DefinedClauseName = keyof typeof MBQL_CLAUSES;
