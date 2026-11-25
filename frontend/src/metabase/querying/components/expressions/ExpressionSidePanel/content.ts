import { t } from "ttag";

import type * as Lib from "metabase-lib";

export type SidePanelIconName =
  | "conversion"
  | "convert"
  | "date"
  | "function-general"
  | "math"
  | "table-column"
  | "table-row"
  | "text"
  | "time";

/** The two views of the panel: every function, and ready-made snippets. */
export type SidePanelTab = "templates" | "functions";

export type SidePanelTemplateItem = {
  type: "template";
  name: string;
  /** What the snippet gives, in a sentence or two, for the panel to show. */
  description: string;
  /** Inserted as a fill-in: its columns and quoted values become blanks. */
  code: string;
  /** Only when it differs from the section's icon. */
  icon?: SidePanelIconName;
};

export type SidePanelFunctionItem = {
  type: "function";
  /** The display name, as typed in the editor. */
  name: string;
};

export type SidePanelItem = SidePanelTemplateItem | SidePanelFunctionItem;

export type SidePanelSection = {
  name: string;
  icon: SidePanelIconName;
  /** Groups of rows, with a line between them. */
  blocks: SidePanelItem[][];
};

export const POPULAR_FUNCTIONS: Record<Lib.ExpressionMode, string[]> = {
  expression: ["case", "coalesce", "datetimeDiff", "concat", "round"],
  filter: ["contains", "in", "interval", "isNull", "between"],
  aggregation: ["Count", "Sum", "CountIf", "Distinct", "Share"],
};

/** Each function keeps one icon everywhere it appears. */
export const FUNCTION_ICONS: Record<string, SidePanelIconName> = {
  // Logic
  case: "function-general",
  coalesce: "function-general",
  isNull: "function-general",
  notNull: "function-general",
  isEmpty: "function-general",
  notEmpty: "function-general",
  in: "function-general",
  notIn: "function-general",
  between: "function-general",
  CountIf: "function-general",
  SumIf: "function-general",
  DistinctIf: "function-general",
  Share: "function-general",
  Offset: "function-general",
  // Numbers
  abs: "math",
  power: "math",
  sqrt: "math",
  log: "math",
  exp: "math",
  integer: "math",
  float: "math",
  round: "math",
  floor: "math",
  ceil: "math",
  datetimeDiff: "math",
  datetimeAdd: "math",
  datetimeSubtract: "math",
  interval: "math",
  intervalStartingFrom: "math",
  Count: "math",
  Sum: "math",
  Average: "math",
  Distinct: "math",
  Min: "math",
  Max: "math",
  Median: "math",
  Percentile: "math",
  StandardDeviation: "math",
  Variance: "math",
  CumulativeSum: "math",
  CumulativeCount: "math",
  // Text
  text: "text",
  contains: "text",
  doesNotContain: "text",
  startsWith: "text",
  endsWith: "text",
  concat: "text",
  trim: "text",
  lTrim: "text",
  rTrim: "text",
  lower: "text",
  upper: "text",
  replace: "text",
  length: "text",
  collate: "text",
  domain: "text",
  host: "text",
  subdomain: "text",
  path: "text",
  substring: "text",
  splitPart: "text",
  regexExtract: "text",
  // Dates
  year: "date",
  month: "date",
  quarter: "date",
  week: "date",
  day: "date",
  weekday: "date",
  today: "date",
  now: "date",
  relativeDateTime: "date",
  timeSpan: "date",
  convertTimezone: "date",
  date: "date",
  datetime: "date",
  monthName: "date",
  quarterName: "date",
  dayName: "date",
  // Times
  hour: "time",
  minute: "time",
  second: "time",
};

/** Functions shown with a clock rather than their section's icon. */
export const TIME_FUNCTIONS = new Set(["hour", "minute", "second"]);

/** The label of the templates' tab: what they are called in each editor. */
export function getTemplatesTabLabel(expressionMode: Lib.ExpressionMode) {
  switch (expressionMode) {
    case "filter":
      return t`Conditions`;
    case "aggregation":
      return t`Aggregations`;
    default:
      return t`Snippets`;
  }
}

export function getSidePanelSections(
  expressionMode: Lib.ExpressionMode,
  tab: SidePanelTab,
): SidePanelSection[] {
  if (tab === "functions") {
    return getFunctionSections(expressionMode);
  }
  switch (expressionMode) {
    case "filter":
      return getConditionSections();
    case "aggregation":
      return getAggregationSections();
    default:
      return getTemplateSections();
  }
}

function template(
  item: Omit<SidePanelTemplateItem, "type">,
): SidePanelTemplateItem {
  return { type: "template", ...item };
}

function functions(...names: string[]): SidePanelFunctionItem[] {
  return names.map((name) => ({ type: "function", name }));
}

/** Custom column: Snippets */
function getTemplateSections(): SidePanelSection[] {
  return [
    {
      name: t`Text`,
      icon: "text",
      blocks: [
        [
          template({
            name: t`Count characters`,
            description: t`The number of characters in the text, spaces included.`,
            code: `length([Text])`,
          }),
        ],
        [
          template({
            name: t`Replace text`,
            description: t`Replaces every match of one text with another, like removing "https://" from links.`,
            code: `replace([Text], "https://", "")`,
          }),
          template({
            name: t`Lowercase and trim spaces`,
            description: t`Makes the text lowercase and removes spaces at the start and end, so " Acme" and "acme" match.`,
            code: `lower(trim([Text]))`,
          }),
        ],
        [
          template({
            name: t`Domain of an email or website`,
            description: t`The domain with its ending, like "metabase.com" from "hello@metabase.com".`,
            code: `host([Text])`,
          }),
          template({
            name: t`Digits from text`,
            description: t`The first run of digits in the text, like "1042" from "Order #1042". The result is text.`,
            code: `regexExtract([Text], "[0-9]+")`,
          }),
        ],
        [
          template({
            name: t`Text contains a word`,
            description: t`True when the text contains the word, in any capitalization.`,
            code: `contains([Text], "refund", "case-insensitive")`,
          }),
          template({
            name: t`Text contains any of several words`,
            description: t`True when the text contains at least one of the words. Capitalization must match.`,
            code: `contains([Text], "student") OR contains([Text], "intern")`,
          }),
        ],
        [
          template({
            name: t`First characters of text`,
            description: t`The first 2 characters of the text, like "AB" from "AB-1234". Change 2 to take more.`,
            code: `substring([Text], 1, 2)`,
          }),
          template({
            name: t`Text before a separator`,
            description: t`Everything before the first separator, like "2026" from "2026-05-14".`,
            code: `splitPart([Text], "-", 1)`,
          }),
          template({
            name: t`Text after a separator`,
            description: t`The second part of the text split by a separator, like "invoices" from "docs/invoices". Change 2 for a later part.`,
            code: `splitPart([Text], "/", 2)`,
          }),
        ],
      ],
    },
    {
      name: t`Dates`,
      icon: "date",
      blocks: [
        [
          template({
            name: t`Age in years`,
            description: t`Whole years from the date until today, like an age from a birth date.`,
            code: `datetimeDiff([Date], today(), "year")`,
          }),
          template({
            name: t`Year of a date`,
            description: t`The year of the date as a number, like 2026.`,
            code: `year([Date])`,
          }),
        ],
        [
          template({
            name: t`Days since a date`,
            description: t`Days from the date until today. Dates in the future give negative numbers.`,
            code: `datetimeDiff([Date], today(), "day")`,
          }),
          template({
            name: t`Days between two dates`,
            description: t`Days from the first date to the second, like from order to delivery. Negative when the second date is earlier.`,
            code: `datetimeDiff([Date 1], [Date 2], "day")`,
          }),
        ],
        [
          template({
            name: t`Add days to a date`,
            description: t`The date plus a number of days, like a due date 7 days after an order. A negative number goes back.`,
            code: `datetimeAdd([Date], 7, "day")`,
          }),
        ],
      ],
    },
    {
      name: t`Numbers`,
      icon: "math",
      blocks: [
        [
          template({
            name: t`Multiply two columns`,
            description: t`One column times another, like price times quantity. Change * to +, - or / for other math.`,
            code: `[Number 1] * [Number 2]`,
          }),
          template({
            name: t`Higher of two columns`,
            description: t`The larger of the two values in each row.`,
            code: `case([Number 1] > [Number 2], [Number 1], [Number 2])`,
          }),
          template({
            name: t`Percent change between two columns`,
            description: t`How much the first value differs from the second, as a decimal: 0.25 is 25% more. Empty when the second is 0.`,
            code: `([Number 1] - [Number 2]) / [Number 2]`,
          }),
        ],
        [
          template({
            name: t`Make a number positive`,
            description: t`The number without its minus sign: -5 becomes 5.`,
            code: `abs([Number])`,
          }),
          template({
            name: t`Round to 2 decimals`,
            description: t`Rounds to 2 decimal places, like 3.14159 to 3.14.`,
            code: `round([Number] * 100) / 100`,
          }),
          template({
            name: t`Pad a number with a leading zero`,
            description: t`Turns 1 to 9 into "01" to "09", so that the numbers sort in order as text. The result is text.`,
            code: `case([Number] < 10, concat("0", text([Number])), text([Number]))`,
          }),
        ],
        [
          template({
            name: t`Group numbers into ranges`,
            description: t`Puts each number in a range: 30 or less, 31 to 60, and over 60. Edit the limits and the labels.`,
            code: `case([Number] <= 30, "30 or less", [Number] <= 60, "31–60", "Over 60")`,
          }),
        ],
      ],
    },
    {
      name: t`Conversion and format`,
      icon: "conversion",
      blocks: [
        [
          template({
            name: t`Text to whole number`,
            description: t`Turns text like "42" into a number, to do math with it. Text with decimals, like "4.2", gives an error.`,
            code: `integer([Text])`,
          }),
          template({
            name: t`Text to date`,
            description: t`Turns text in the format "2026-05-14" into a date, to filter and group by it.`,
            code: `date([Text])`,
          }),
          template({
            name: t`Number or date to text`,
            description: t`Turns a number or a date into text, to join it with other text.`,
            code: `text([Column])`,
          }),
          template({
            name: t`Month name of a date`,
            description: t`The short name of the month, like "Oct".`,
            code: `monthName(month([Date]))`,
          }),
        ],
      ],
    },
    {
      name: t`Rows and columns`,
      icon: "table-column",
      blocks: [
        [
          template({
            name: t`Join text columns`,
            description: t`Joins two text columns with a separator, like a first and a last name. Empty when either is empty.`,
            code: `concat([Text 1], " ", [Text 2])`,
          }),
        ],
        [
          template({
            name: t`Replace empty values`,
            description: t`Uses a fallback, like 0, where the column is empty.`,
            code: `coalesce([Number], 0)`,
          }),
          template({
            name: t`Label empty and filled values`,
            description: t`One label where the column is empty, and another where it has a value.`,
            code: `case(isNull([Column]), "Not shipped", "Shipped")`,
          }),
          template({
            name: t`Add columns that may be empty`,
            description: t`Adds two columns, counting empty values as 0. A plain + is empty when either value is.`,
            code: `coalesce([Number 1], 0) + coalesce([Number 2], 0)`,
          }),
          template({
            name: t`Turn zeros into empty values`,
            description: t`Leaves the value empty where it's 0, so that averages skip it and divisions by it don't fail.`,
            code: `case([Number] != 0, [Number])`,
          }),
        ],
        [
          template({
            name: t`Label rows by a condition`,
            description: t`One label for rows that match a condition, and another for the rest.`,
            code: `case([Text] = "Done", "Closed", "Open")`,
            icon: "table-row",
          }),
          template({
            name: t`Flag rows with 1 or 0`,
            description: t`1 where the column has a value, and 0 where it's empty. Sum it to count the rows.`,
            code: `case(notNull([Column]), 1, 0)`,
            icon: "table-row",
          }),
        ],
        [
          template({
            name: t`Group values under labels`,
            description: t`Gives lists of values a label each, like states to regions. Other values get "Other".`,
            code: `case(in([Text], "CA", "OR", "WA"), "West", in([Text], "NY", "NJ"), "East", "Other")`,
          }),
          template({
            name: t`Value is one of a list`,
            description: t`True when the value is one of the listed values.`,
            code: `in([Text], "Paid", "Cleared")`,
          }),
        ],
      ],
    },
  ];
}

/** Filter: Conditions. Each one is true or false for a row. */
function getConditionSections(): SidePanelSection[] {
  return [
    {
      name: t`Text`,
      icon: "text",
      blocks: [
        [
          template({
            name: t`Text longer than N characters`,
            description: t`Rows where the text has more than 100 characters.`,
            code: `length([Text]) > 100`,
          }),
          template({
            name: t`Text contains a word`,
            description: t`Rows where the text contains the word, in any capitalization.`,
            code: `contains([Text], "refund", "case-insensitive")`,
          }),
          template({
            name: t`Text contains any of several words`,
            description: t`Rows where the text contains at least one of the words. Capitalization must match.`,
            code: `contains([Text], "student") OR contains([Text], "intern")`,
          }),
          template({
            name: t`Text starts with`,
            description: t`Rows where the text starts with the given text, like "AB" in "AB-1234". Capitalization must match.`,
            code: `startsWith([Text], "AB")`,
          }),
        ],
      ],
    },
    {
      name: t`Dates`,
      icon: "date",
      blocks: [
        [
          template({
            name: t`Dates this month`,
            description: t`Rows with a date in the current calendar month.`,
            code: `interval([Date], 0, "month")`,
          }),
          template({
            name: t`Dates in the last N days`,
            description: t`Rows with a date in the 30 days before today, not counting today. Change -30 for another range.`,
            code: `interval([Date], -30, "day")`,
          }),
          template({
            name: t`Dates in the next N days`,
            description: t`Rows with a date in the 7 days after today, not counting today.`,
            code: `interval([Date], 7, "day")`,
          }),
          template({
            name: t`Dates in a given year`,
            description: t`Rows with a date in 2026.`,
            code: `year([Date]) = 2026`,
          }),
          template({
            name: t`Dates before a given date`,
            description: t`Rows with a date before January 1, 2026. Use > for dates after it.`,
            code: `[Date] < "2026-01-01"`,
          }),
        ],
      ],
    },
    {
      name: t`Rows and columns`,
      icon: "table-column",
      blocks: [
        [
          template({
            name: t`Rows where a column has a value`,
            description: t`Rows where the column isn't empty.`,
            code: `notNull([Column])`,
            icon: "table-row",
          }),
          template({
            name: t`One date after another`,
            description: t`Rows where the first date is later than the second, like orders shipped after their due date.`,
            code: `[Date 1] > [Date 2]`,
          }),
          template({
            name: t`Value is one of a list`,
            description: t`Rows where the value is one of the listed values.`,
            code: `in([Text], "Paid", "Cleared")`,
          }),
        ],
      ],
    },
  ];
}

/** Summarize: Aggregations. Each one combines many rows into one value. */
function getAggregationSections(): SidePanelSection[] {
  return [
    {
      name: t`Rows and columns`,
      icon: "table-column",
      blocks: [
        [
          template({
            name: t`Count rows`,
            description: t`The number of rows.`,
            code: `Count()`,
            icon: "table-row",
          }),
          template({
            name: t`Count rows that match`,
            description: t`The number of rows that match a condition.`,
            code: `CountIf([Text] = "Done")`,
            icon: "table-row",
          }),
          template({
            name: t`Count unique values`,
            description: t`The number of different values in a column.`,
            code: `Distinct([Column])`,
            icon: "table-row",
          }),
        ],
        [
          template({
            name: t`Total of a column`,
            description: t`Adds up all the values of a column.`,
            code: `Sum([Number])`,
          }),
          template({
            name: t`Difference between two totals`,
            description: t`The total of one column minus the total of another.`,
            code: `Sum([Number 1]) - Sum([Number 2])`,
          }),
        ],
        [
          template({
            name: t`Total for matching rows`,
            description: t`Adds up a column only for the rows that match a condition.`,
            code: `SumIf([Number], [Text] = "Paid")`,
            icon: "table-row",
          }),
          template({
            name: t`Unique values in matching rows`,
            description: t`The number of different values among the rows that match a condition.`,
            code: `DistinctIf([Column], [Text] = "Done")`,
            icon: "table-row",
          }),
          template({
            name: t`Average for matching rows`,
            description: t`The average of a column only for the rows that match a condition.`,
            code: `Average(case([Text] = "Done", [Number]))`,
            icon: "table-row",
          }),
          template({
            name: t`Percentage of rows that match`,
            description: t`The share of rows that match a condition, as a decimal: 0.25 is 25%.`,
            code: `Share([Text] = "Done")`,
            icon: "table-row",
          }),
        ],
      ],
    },
    {
      name: t`Dates`,
      icon: "date",
      blocks: [
        [
          template({
            name: t`Average days between two dates`,
            description: t`The average number of days from one date to another, like from order to delivery.`,
            code: `Average(datetimeDiff([Date 1], [Date 2], "day"))`,
          }),
          template({
            name: t`Count rows from the last N days`,
            description: t`The number of rows with a date in the 30 days before today, not counting today.`,
            code: `CountIf(interval([Date], -30, "day"))`,
          }),
        ],
      ],
    },
    {
      name: t`Numbers`,
      icon: "math",
      blocks: [
        [
          template({
            name: t`Running total`,
            description: t`The total so far, row by row. Group by a date to see it grow over time.`,
            code: `CumulativeSum([Number])`,
          }),
        ],
        [
          template({
            name: t`Previous period's total`,
            description: t`The total of the row before, like last month's sales next to this month's. Group by a date first.`,
            code: `Offset(Sum([Number]), -1)`,
          }),
          template({
            name: t`Percent change from the previous period`,
            description: t`How much the total changed from the row before, as a decimal: 0.1 is 10% more. Group by a date first.`,
            code: `(Sum([Number]) - Offset(Sum([Number]), -1)) / Offset(Sum([Number]), -1)`,
          }),
          template({
            name: t`Rate of one outcome out of two`,
            description: t`Yes divided by yes plus no, like a conversion rate. Rows with other values don't count.`,
            code: `CountIf([Text] = "Yes") / (CountIf([Text] = "Yes") + CountIf([Text] = "No"))`,
          }),
        ],
        functions(
          "Average",
          "Count",
          "CountIf",
          "CumulativeCount",
          "CumulativeSum",
          "Distinct",
          "DistinctIf",
          "Max",
          "Median",
          "Min",
          "Offset",
          "Percentile",
          "Share",
          "StandardDeviation",
          "Sum",
          "SumIf",
          "Variance",
        ),
      ],
    },
  ];
}

/** Functions, the same in every editor except that only custom columns get timeSpan. */
function getFunctionSections(
  expressionMode: Lib.ExpressionMode,
): SidePanelSection[] {
  const dateFunctions = functions(
    "convertTimezone",
    "datetimeAdd",
    "datetimeDiff",
    "datetimeSubtract",
    "interval",
    "intervalStartingFrom",
    "relativeDateTime",
    ...(expressionMode === "expression" ? ["timeSpan"] : []),
  );

  return [
    {
      name: t`Logic`,
      icon: "function-general",
      blocks: [
        functions(
          "between",
          "case",
          "coalesce",
          "isEmpty",
          "isNull",
          "in",
          "notEmpty",
          "notIn",
          "notNull",
        ),
      ],
    },
    {
      name: t`Text`,
      icon: "text",
      blocks: [
        functions(
          "collate",
          "concat",
          "length",
          "lower",
          "lTrim",
          "replace",
          "rTrim",
          "trim",
          "upper",
        ),
        functions(
          "domain",
          "host",
          "path",
          "regexExtract",
          "subdomain",
          "substring",
          "splitPart",
        ),
        functions("contains", "doesNotContain", "endsWith", "startsWith"),
      ],
    },
    {
      name: t`Dates`,
      icon: "date",
      blocks: [
        functions(
          "year",
          "month",
          "quarter",
          "week",
          "day",
          "weekday",
          "hour",
          "minute",
          "second",
        ),
        functions("now", "today"),
        dateFunctions,
      ],
    },
    {
      name: t`Numbers`,
      icon: "math",
      blocks: [
        functions("abs", "exp", "log", "power", "sqrt"),
        functions("ceil", "float", "floor", "integer", "round"),
      ],
    },
    {
      name: t`Conversion and format`,
      icon: "conversion",
      blocks: [
        functions(
          "date",
          "datetime",
          "dayName",
          "monthName",
          "text",
          "quarterName",
        ),
      ],
    },
  ];
}
