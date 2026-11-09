import { t } from "ttag";

import type * as Lib from "metabase-lib";

export type SidePanelIconName =
  | "convert"
  | "date"
  | "function-general"
  | "math"
  | "table-column"
  | "table-row"
  | "text"
  | "time";

export type SidePanelGroupId =
  | "calculate"
  | "check"
  | "compare"
  | "convert"
  | "count"
  | "count-some"
  | "dates"
  | "label"
  | "missing"
  | "pull"
  | "text";

export type SidePanelTool = {
  name: string;
  icon: SidePanelIconName;
};

export type SidePanelTemplate = {
  name: string;
  /** The ready-made snippet. Not inserted anywhere yet. */
  code: string;
  icon: SidePanelIconName;
  modes: Lib.ExpressionMode[];
};

export type SidePanelGroup = {
  id: SidePanelGroupId;
  name: string;
  templates: SidePanelTemplate[];
  /** Display names, as typed in the editor. */
  functions: string[];
  functionsLabel: string;
};

const C: Lib.ExpressionMode = "expression";
const F: Lib.ExpressionMode = "filter";
const S: Lib.ExpressionMode = "aggregation";

export const GROUP_ORDER: Record<Lib.ExpressionMode, SidePanelGroupId[]> = {
  expression: [
    "label",
    "dates",
    "missing",
    "pull",
    "convert",
    "calculate",
    "text",
    "check",
  ],
  filter: [
    "check",
    "dates",
    "missing",
    "pull",
    "text",
    "calculate",
    "convert",
    "label",
  ],
  aggregation: [
    "count-some",
    "count",
    "compare",
    "check",
    "calculate",
    "missing",
    "label",
    "pull",
    "dates",
    "text",
    "convert",
  ],
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

export function getSidePanelTools(
  expressionMode: Lib.ExpressionMode,
): SidePanelTool[] {
  const aiTools: SidePanelTool[] = [
    { name: t`Ask AI`, icon: "convert" },
    { name: t`Convert from SQL or Excel`, icon: "convert" },
  ];

  if (expressionMode !== "expression") {
    return aiTools;
  }

  return [
    ...aiTools,
    { name: t`Combine columns`, icon: "table-column" },
    { name: t`Extract columns`, icon: "table-column" },
  ];
}

export function getSidePanelGroups(): Record<SidePanelGroupId, SidePanelGroup> {
  const functionsLabel = t`Functions`;
  const aggregationsLabel = t`Aggregations`;

  return {
    label: {
      id: "label",
      name: t`Label or group values`,
      functionsLabel,
      templates: [
        {
          name: t`Label rows by a condition`,
          code: `case([Status] = "Done", "Closed", "Open")`,
          icon: "table-row",
          modes: [C],
        },
        {
          name: t`Map many values to labels`,
          code: `case(in([State], "CA", "OR", "WA"), "West", in([State], "NY", "NJ"), "East", "Other")`,
          icon: "table-row",
          modes: [C],
        },
        {
          name: t`Sort numbers into ranges`,
          code: `case([Days] <= 30, "0–30", [Days] <= 60, "31–60", "60+")`,
          icon: "math",
          modes: [C],
        },
        {
          name: t`Flag rows with 1 or 0`,
          code: `case(notNull([Signed At]), 1, 0)`,
          icon: "table-row",
          modes: [C, S],
        },
      ],
      functions: ["case"],
    },
    missing: {
      id: "missing",
      name: t`Deal with missing values`,
      functionsLabel,
      templates: [
        {
          name: t`Replace empty with a default`,
          code: `coalesce([Discount], 0)`,
          icon: "table-column",
          modes: [C, S],
        },
        {
          name: t`Show a label when empty`,
          code: `case(isNull([Shipped At]), "Not shipped", "Shipped")`,
          icon: "table-column",
          modes: [C],
        },
        {
          name: t`Keep rows where a value is filled`,
          code: `notNull([Email])`,
          icon: "table-row",
          modes: [F],
        },
        {
          name: t`Add columns when one may be empty`,
          code: `coalesce([Deposit], 0) + coalesce([Goods], 0)`,
          icon: "table-column",
          modes: [C],
        },
        {
          name: t`Leave a value empty on purpose`,
          code: `case([Amount] != 0, [Amount])`,
          icon: "table-column",
          modes: [C],
        },
      ],
      functions: ["coalesce", "isNull", "notNull", "isEmpty", "notEmpty"],
    },
    dates: {
      id: "dates",
      name: t`Work with dates`,
      functionsLabel,
      templates: [
        {
          name: t`Days between two dates`,
          code: `datetimeDiff([Created At], [Closed At], "day")`,
          icon: "date",
          modes: [C, S],
        },
        {
          name: t`Days since a date`,
          code: `datetimeDiff([Created At], today(), "day")`,
          icon: "date",
          modes: [C],
        },
        {
          name: t`Age in years`,
          code: `datetimeDiff([Birth Date], today(), "year")`,
          icon: "date",
          modes: [C],
        },
        {
          name: t`Add or subtract time`,
          code: `datetimeAdd([Order Date], 7, "day")`,
          icon: "math",
          modes: [C],
        },
        {
          name: t`Start of this month`,
          code: `datetimeSubtract(today(), day(today()) - 1, "day")`,
          icon: "date",
          modes: [C, F],
        },
        {
          name: t`Dates in the last N days`,
          code: `interval([Created At], -30, "day")`,
          icon: "date",
          modes: [F, S],
        },
        {
          name: t`Dates in the next N days`,
          code: `interval([Due Date], 7, "day")`,
          icon: "date",
          modes: [F, S],
        },
        {
          name: t`Dates before or after a fixed date`,
          code: `[Created At] < "2026-01-01"`,
          icon: "date",
          modes: [F],
        },
      ],
      functions: [
        "today",
        "now",
        "datetimeDiff",
        "datetimeAdd",
        "datetimeSubtract",
        "interval",
        "intervalStartingFrom",
        "relativeDateTime",
        "timeSpan",
        "convertTimezone",
      ],
    },
    pull: {
      id: "pull",
      name: t`Pull out part of a value`,
      functionsLabel,
      templates: [
        {
          name: t`Text before a character`,
          code: `splitPart([Stock Code], "-", 1)`,
          icon: "text",
          modes: [C],
        },
        {
          name: t`Text after a character`,
          code: `splitPart([Name], "/", 2)`,
          icon: "text",
          modes: [C],
        },
        {
          name: t`First N characters`,
          code: `substring([SKU], 1, 2)`,
          icon: "text",
          modes: [C, F],
        },
        {
          name: t`Domain from an email`,
          code: `domain([Email])`,
          icon: "text",
          modes: [C],
        },
        {
          name: t`Number from text`,
          code: `regexExtract([Code], "[0-9]+")`,
          icon: "text",
          modes: [C],
        },
        {
          name: t`Year or month of a date`,
          code: `year([Created At])`,
          icon: "text",
          modes: [C, F],
        },
      ],
      functions: [
        "year",
        "month",
        "quarter",
        "week",
        "day",
        "weekday",
        "hour",
        "minute",
        "second",
        "domain",
        "host",
        "subdomain",
        "path",
        "substring",
        "splitPart",
        "regexExtract",
      ],
    },
    check: {
      id: "check",
      name: t`Check if a value matches`,
      functionsLabel,
      templates: [
        {
          name: t`Text contains a word`,
          code: `contains([Title], "refund", "case-insensitive")`,
          icon: "text",
          modes: [C, F, S],
        },
        {
          name: t`Text contains any of several words`,
          code: `contains([Job Title], "student") OR contains([Job Title], "intern")`,
          icon: "text",
          modes: [C, F, S],
        },
        {
          name: t`Value is one of a list`,
          code: `in([Status], "Paid", "Cleared")`,
          icon: "function-general",
          modes: [C, F, S],
        },
        {
          name: t`Number or date in a range`,
          code: `between([Score], 7, 10)`,
          icon: "function-general",
          modes: [F, S],
        },
        {
          name: t`Compare two columns`,
          code: `[Delivered At] > [Due Date]`,
          icon: "table-column",
          modes: [F, S],
        },
        {
          name: t`Combine conditions`,
          code: `[Country] = "US" AND ([Plan] = "Pro" OR [Plan] = "Team")`,
          icon: "function-general",
          modes: [F, S],
        },
      ],
      functions: [
        "contains",
        "doesNotContain",
        "startsWith",
        "endsWith",
        "in",
        "notIn",
        "between",
      ],
    },
    calculate: {
      id: "calculate",
      name: t`Calculate a new value`,
      functionsLabel,
      templates: [
        {
          name: t`Calculate with two columns`,
          code: `[Price] * [Quantity]`,
          icon: "table-column",
          modes: [C, F],
        },
        {
          name: t`Percent change between two columns`,
          code: `([This Year] - [Last Year]) / [Last Year]`,
          icon: "table-column",
          modes: [C],
        },
        {
          name: t`Higher of two columns`,
          code: `case([Digital] > [Analog], [Digital], [Analog])`,
          icon: "table-column",
          modes: [C],
        },
        {
          name: t`Make a number positive`,
          code: `abs([Amount])`,
          icon: "math",
          modes: [C],
        },
      ],
      functions: ["abs", "power", "sqrt", "log", "exp"],
    },
    text: {
      id: "text",
      name: t`Combine and clean up text`,
      functionsLabel,
      templates: [
        {
          name: t`Join columns with a separator`,
          code: `concat([First Name], " ", [Last Name])`,
          icon: "table-column",
          modes: [C],
        },
        {
          name: t`Remove or replace text`,
          code: `replace([URL], "https://", "")`,
          icon: "text",
          modes: [C],
        },
        {
          name: t`Tidy up spaces and capitals`,
          code: `lower(trim([Email]))`,
          icon: "text",
          modes: [C, F],
        },
        {
          name: t`Count characters`,
          code: `length([Comment])`,
          icon: "text",
          modes: [C, F],
        },
      ],
      functions: [
        "concat",
        "trim",
        "lTrim",
        "rTrim",
        "lower",
        "upper",
        "replace",
        "length",
        "collate",
      ],
    },
    convert: {
      id: "convert",
      name: t`Convert or format a value`,
      functionsLabel,
      templates: [
        {
          name: t`Text to number`,
          code: `integer([Amount Text])`,
          icon: "text",
          modes: [C, F],
        },
        {
          name: t`Number or date to text`,
          code: `text([Invoice ID])`,
          icon: "text",
          modes: [C],
        },
        {
          name: t`Text to date`,
          code: `date([Date Text])`,
          icon: "text",
          modes: [C, F],
        },
        {
          name: t`Round to 2 decimals`,
          code: `round([Amount] * 100) / 100`,
          icon: "math",
          modes: [C, S],
        },
        {
          name: t`Add a leading zero`,
          code: `case([Month] < 10, concat("0", text([Month])), text([Month]))`,
          icon: "math",
          modes: [C],
        },
        {
          name: t`Show a month as a name`,
          code: `monthName(month([Created At]))`,
          icon: "text",
          modes: [C],
        },
      ],
      functions: [
        "text",
        "integer",
        "float",
        "date",
        "datetime",
        "round",
        "floor",
        "ceil",
        "monthName",
        "quarterName",
        "dayName",
      ],
    },
    count: {
      id: "count",
      name: t`Count and total rows`,
      functionsLabel: aggregationsLabel,
      templates: [
        {
          name: t`Count rows`,
          code: `Count()`,
          icon: "table-row",
          modes: [S],
        },
        {
          name: t`Count unique values`,
          code: `Distinct([Customer ID])`,
          icon: "math",
          modes: [S],
        },
        {
          name: t`Total a column`,
          code: `Sum([Amount])`,
          icon: "table-column",
          modes: [S],
        },
      ],
      functions: [
        "Count",
        "Sum",
        "Average",
        "Distinct",
        "Min",
        "Max",
        "Median",
        "Percentile",
        "StandardDeviation",
        "Variance",
      ],
    },
    "count-some": {
      id: "count-some",
      name: t`Count and total only some rows`,
      functionsLabel: aggregationsLabel,
      templates: [
        {
          name: t`Count rows that match`,
          code: `CountIf([Status] = "Done")`,
          icon: "table-row",
          modes: [S],
        },
        {
          name: t`Total for matching rows`,
          code: `SumIf([Amount], [Status] = "Paid")`,
          icon: "table-row",
          modes: [S],
        },
        {
          name: t`Unique values in matching rows`,
          code: `DistinctIf([Customer ID], [Status] = "Done")`,
          icon: "table-row",
          modes: [S],
        },
        {
          name: t`Average for matching rows`,
          code: `Average(case([Status] = "Done", [Score]))`,
          icon: "table-row",
          modes: [S],
        },
        {
          name: t`Percentage of rows that match`,
          code: `Share([Status] = "Done")`,
          icon: "table-row",
          modes: [S],
        },
        {
          name: t`Rate between two counts`,
          code: `CountIf([Answer] = "Yes") / (CountIf([Answer] = "Yes") + CountIf([Answer] = "No"))`,
          icon: "math",
          modes: [S],
        },
      ],
      functions: ["CountIf", "SumIf", "DistinctIf", "Share"],
    },
    compare: {
      id: "compare",
      name: t`Compare to earlier rows`,
      functionsLabel,
      templates: [
        {
          name: t`Running total`,
          code: `CumulativeSum([Amount])`,
          icon: "math",
          modes: [S],
        },
        {
          name: t`Previous period's value`,
          code: `Offset(Sum([Amount]), -1)`,
          icon: "math",
          modes: [S],
        },
        {
          name: t`Change vs previous period`,
          code: `(Sum([Amount]) - Offset(Sum([Amount]), -1)) / Offset(Sum([Amount]), -1)`,
          icon: "math",
          modes: [S],
        },
      ],
      functions: ["CumulativeSum", "CumulativeCount", "Offset"],
    },
  };
}
