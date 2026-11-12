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

/** The two views of the panel: ready-made snippets, and every function. */
export type SidePanelTab = "templates" | "functions";

export type SidePanelTemplateItem = {
  type: "template";
  name: string;
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

/** The label of the first tab: what the templates are called in each editor. */
export function getTemplatesTabLabel(expressionMode: Lib.ExpressionMode) {
  switch (expressionMode) {
    case "filter":
      return t`Conditions`;
    case "aggregation":
      return t`Aggregations`;
    default:
      return t`Templates`;
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
  name: string,
  code: string,
  icon?: SidePanelIconName,
): SidePanelTemplateItem {
  return { type: "template", name, code, icon };
}

function functions(...names: string[]): SidePanelFunctionItem[] {
  return names.map((name) => ({ type: "function", name }));
}

/** Custom column: Templates */
function getTemplateSections(): SidePanelSection[] {
  return [
    {
      name: t`Text`,
      icon: "text",
      blocks: [
        [template(t`Count characters`, `length([Comment])`)],
        [
          template(t`Remove or replace text`, `replace([URL], "https://", "")`),
          template(t`Tidy up spaces and capitals`, `lower(trim([Email]))`),
        ],
        [
          template(t`Domain from an email`, `domain([Email])`),
          template(t`Number from text`, `regexExtract([Code], "[0-9]+")`),
          template(t`Year or month of a date`, `year([Created At])`),
        ],
        [
          template(
            t`Text contains a word`,
            `contains([Title], "refund", "case-insensitive")`,
          ),
          template(
            t`Text contains any of several words`,
            `contains([Job Title], "student") OR contains([Job Title], "intern")`,
          ),
        ],
        [
          template(t`First N characters`, `substring([SKU], 1, 2)`),
          template(
            t`Text before a character`,
            `splitPart([Stock Code], "-", 1)`,
          ),
          template(t`Text after a character`, `splitPart([Name], "/", 2)`),
        ],
      ],
    },
    {
      name: t`Dates`,
      icon: "date",
      blocks: [
        [
          template(
            t`Age in years`,
            `datetimeDiff([Birth Date], today(), "year")`,
          ),
          template(
            t`Start of this month`,
            `datetimeSubtract(today(), day(today()) - 1, "day")`,
          ),
        ],
        [
          template(
            t`Days since a date`,
            `datetimeDiff([Created At], today(), "day")`,
          ),
          template(
            t`Days between two dates`,
            `datetimeDiff([Created At], [Closed At], "day")`,
          ),
        ],
        [
          template(
            t`Add or subtract time`,
            `datetimeAdd([Order Date], 7, "day")`,
          ),
        ],
      ],
    },
    {
      name: t`Numbers`,
      icon: "math",
      blocks: [
        [
          template(t`Calculate with two columns`, `[Price] * [Quantity]`),
          template(
            t`Higher of two columns`,
            `case([Digital] > [Analog], [Digital], [Analog])`,
          ),
          template(
            t`Percent change between two columns`,
            `([This Year] - [Last Year]) / [Last Year]`,
          ),
        ],
        [
          template(t`Make a number positive`, `abs([Amount])`),
          template(t`Round to 2 decimals`, `round([Amount] * 100) / 100`),
          template(
            t`Add a leading zero`,
            `case([Month] < 10, concat("0", text([Month])), text([Month]))`,
          ),
        ],
        [
          template(
            t`Sort numbers into ranges`,
            `case([Days] <= 30, "0–30", [Days] <= 60, "31–60", "60+")`,
          ),
        ],
      ],
    },
    {
      name: t`Conversion and format`,
      icon: "conversion",
      blocks: [
        [
          template(t`Text to number`, `integer([Amount Text])`),
          template(t`Text to date`, `date([Date Text])`),
          template(t`Number or date to text`, `text([Invoice ID])`),
          template(t`Show a month as a name`, `monthName(month([Created At]))`),
        ],
      ],
    },
    {
      name: t`Rows and columns`,
      icon: "table-column",
      blocks: [
        [
          template(
            t`Join text columns with a separator`,
            `concat([First Name], " ", [Last Name])`,
          ),
        ],
        [
          template(t`Replace empty with a default`, `coalesce([Discount], 0)`),
          template(
            t`Show a label when empty`,
            `case(isNull([Shipped At]), "Not shipped", "Shipped")`,
          ),
          template(
            t`Add columns when one may be empty`,
            `coalesce([Deposit], 0) + coalesce([Goods], 0)`,
          ),
          template(
            t`Leave a value empty on purpose`,
            `case([Amount] != 0, [Amount])`,
          ),
        ],
        [
          template(
            t`Label rows by a condition`,
            `case([Status] = "Done", "Closed", "Open")`,
            "table-row",
          ),
          template(
            t`Flag rows with 1 or 0`,
            `case(notNull([Signed At]), 1, 0)`,
            "table-row",
          ),
        ],
        [
          template(
            t`Map many values to labels`,
            `case(in([State], "CA", "OR", "WA"), "West", in([State], "NY", "NJ"), "East", "Other")`,
          ),
          template(
            t`Value is one of a list`,
            `in([Status], "Paid", "Cleared")`,
          ),
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
          template(t`Character count`, `length([Comment]) > 100`),
          template(t`Year or month of a date`, `year([Created At]) = 2026`),
          template(
            t`Text contains a word`,
            `contains([Title], "refund", "case-insensitive")`,
          ),
          template(
            t`Text contains any of several words`,
            `contains([Job Title], "student") OR contains([Job Title], "intern")`,
          ),
          template(t`First N characters`, `substring([SKU], 1, 2) = "AB"`),
        ],
      ],
    },
    {
      name: t`Dates`,
      icon: "date",
      blocks: [
        [
          template(
            t`Start of this month`,
            `[Created At] >= datetimeSubtract(today(), day(today()) - 1, "day")`,
          ),
          template(
            t`Dates in the last N days`,
            `interval([Created At], -30, "day")`,
          ),
          template(
            t`Dates in the next N days`,
            `interval([Due Date], 7, "day")`,
          ),
          template(
            t`Dates before or after a fixed date`,
            `[Created At] < "2026-01-01"`,
          ),
        ],
      ],
    },
    {
      name: t`Rows and columns`,
      icon: "table-column",
      blocks: [
        [
          template(t`Rows with filled value`, `notNull([Email])`, "table-row"),
          template(t`Two columns compared`, `[Delivered At] > [Due Date]`),
          template(
            t`Value is one of a list`,
            `in([Status], "Paid", "Cleared")`,
          ),
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
          template(t`Count rows`, `Count()`, "table-row"),
          template(
            t`Count rows that match`,
            `CountIf([Status] = "Done")`,
            "table-row",
          ),
          template(
            t`Count unique values`,
            `Distinct([Customer ID])`,
            "table-row",
          ),
        ],
        [
          template(t`Total a column`, `Sum([Amount])`),
          template(t`Compare two columns`, `Sum([Revenue]) - Sum([Cost])`),
        ],
        [
          template(
            t`Total for matching rows`,
            `SumIf([Amount], [Status] = "Paid")`,
            "table-row",
          ),
          template(
            t`Unique values in matching rows`,
            `DistinctIf([Customer ID], [Status] = "Done")`,
            "table-row",
          ),
          template(
            t`Average for matching rows`,
            `Average(case([Status] = "Done", [Score]))`,
            "table-row",
          ),
          template(
            t`Percentage of rows that match`,
            `Share([Status] = "Done")`,
            "table-row",
          ),
        ],
      ],
    },
    {
      name: t`Dates`,
      icon: "date",
      blocks: [
        [
          template(
            t`Days between two dates`,
            `Average(datetimeDiff([Created At], [Closed At], "day"))`,
          ),
          template(
            t`Dates in the last N days`,
            `CountIf(interval([Created At], -30, "day"))`,
          ),
          template(
            t`Dates in the next N days`,
            `CountIf(interval([Due Date], 7, "day"))`,
          ),
        ],
      ],
    },
    {
      name: t`Numbers`,
      icon: "math",
      blocks: [
        [template(t`Running total`, `CumulativeSum([Amount])`)],
        [
          template(t`Previous period's value`, `Offset(Sum([Amount]), -1)`),
          template(
            t`Change vs previous period`,
            `(Sum([Amount]) - Offset(Sum([Amount]), -1)) / Offset(Sum([Amount]), -1)`,
          ),
          template(
            t`Rate between two counts`,
            `CountIf([Answer] = "Yes") / (CountIf([Answer] = "Yes") + CountIf([Answer] = "No"))`,
          ),
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
