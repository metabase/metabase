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
        [template(t`Count characters`, `length([Text])`)],
        [
          template(
            t`Remove or replace text`,
            `replace([Text], "https://", "")`,
          ),
          template(t`Tidy up spaces and capitals`, `lower(trim([Text]))`),
        ],
        [
          template(t`Domain from an email`, `domain([Text])`),
          template(t`Number from text`, `regexExtract([Text], "[0-9]+")`),
          template(t`Year or month of a date`, `year([Date])`),
        ],
        [
          template(
            t`Text contains a word`,
            `contains([Text], "refund", "case-insensitive")`,
          ),
          template(
            t`Text contains any of several words`,
            `contains([Text], "student") OR contains([Text], "intern")`,
          ),
        ],
        [
          template(t`First N characters`, `substring([Text], 1, 2)`),
          template(t`Text before a character`, `splitPart([Text], "-", 1)`),
          template(t`Text after a character`, `splitPart([Text], "/", 2)`),
        ],
      ],
    },
    {
      name: t`Dates`,
      icon: "date",
      blocks: [
        [
          template(t`Age in years`, `datetimeDiff([Date], today(), "year")`),
          template(
            t`Start of this month`,
            `datetimeSubtract(today(), day(today()) - 1, "day")`,
          ),
        ],
        [
          template(
            t`Days since a date`,
            `datetimeDiff([Date], today(), "day")`,
          ),
          template(
            t`Days between two dates`,
            `datetimeDiff([Date 1], [Date 2], "day")`,
          ),
        ],
        [template(t`Add or subtract time`, `datetimeAdd([Date], 7, "day")`)],
      ],
    },
    {
      name: t`Numbers`,
      icon: "math",
      blocks: [
        [
          template(t`Calculate with two columns`, `[Number 1] * [Number 2]`),
          template(
            t`Higher of two columns`,
            `case([Number 1] > [Number 2], [Number 1], [Number 2])`,
          ),
          template(
            t`Percent change between two columns`,
            `([Number 1] - [Number 2]) / [Number 2]`,
          ),
        ],
        [
          template(t`Make a number positive`, `abs([Number])`),
          template(t`Round to 2 decimals`, `round([Number] * 100) / 100`),
          template(
            t`Add a leading zero`,
            `case([Number] < 10, concat("0", text([Number])), text([Number]))`,
          ),
        ],
        [
          template(
            t`Sort numbers into ranges`,
            `case([Number] <= 30, "0–30", [Number] <= 60, "31–60", "60+")`,
          ),
        ],
      ],
    },
    {
      name: t`Conversion and format`,
      icon: "conversion",
      blocks: [
        [
          template(t`Text to number`, `integer([Text])`),
          template(t`Text to date`, `date([Text])`),
          template(t`Number or date to text`, `text([Column])`),
          template(t`Show a month as a name`, `monthName(month([Date]))`),
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
            `concat([Text 1], " ", [Text 2])`,
          ),
        ],
        [
          template(t`Replace empty with a default`, `coalesce([Number], 0)`),
          template(
            t`Show a label when empty`,
            `case(isNull([Column]), "Not shipped", "Shipped")`,
          ),
          template(
            t`Add columns when one may be empty`,
            `coalesce([Number 1], 0) + coalesce([Number 2], 0)`,
          ),
          template(
            t`Leave a value empty on purpose`,
            `case([Number] != 0, [Number])`,
          ),
        ],
        [
          template(
            t`Label rows by a condition`,
            `case([Text] = "Done", "Closed", "Open")`,
            "table-row",
          ),
          template(
            t`Flag rows with 1 or 0`,
            `case(notNull([Column]), 1, 0)`,
            "table-row",
          ),
        ],
        [
          template(
            t`Map many values to labels`,
            `case(in([Text], "CA", "OR", "WA"), "West", in([Text], "NY", "NJ"), "East", "Other")`,
          ),
          template(t`Value is one of a list`, `in([Text], "Paid", "Cleared")`),
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
          template(t`Character count`, `length([Text]) > 100`),
          template(t`Year or month of a date`, `year([Date]) = 2026`),
          template(
            t`Text contains a word`,
            `contains([Text], "refund", "case-insensitive")`,
          ),
          template(
            t`Text contains any of several words`,
            `contains([Text], "student") OR contains([Text], "intern")`,
          ),
          template(t`First N characters`, `substring([Text], 1, 2) = "AB"`),
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
            `[Date] >= datetimeSubtract(today(), day(today()) - 1, "day")`,
          ),
          template(t`Dates in the last N days`, `interval([Date], -30, "day")`),
          template(t`Dates in the next N days`, `interval([Date], 7, "day")`),
          template(
            t`Dates before or after a fixed date`,
            `[Date] < "2026-01-01"`,
          ),
        ],
      ],
    },
    {
      name: t`Rows and columns`,
      icon: "table-column",
      blocks: [
        [
          template(t`Rows with filled value`, `notNull([Column])`, "table-row"),
          template(t`Two columns compared`, `[Date 1] > [Date 2]`),
          template(t`Value is one of a list`, `in([Text], "Paid", "Cleared")`),
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
            `CountIf([Text] = "Done")`,
            "table-row",
          ),
          template(t`Count unique values`, `Distinct([Column])`, "table-row"),
        ],
        [
          template(t`Total a column`, `Sum([Number])`),
          template(t`Compare two columns`, `Sum([Number 1]) - Sum([Number 2])`),
        ],
        [
          template(
            t`Total for matching rows`,
            `SumIf([Number], [Text] = "Paid")`,
            "table-row",
          ),
          template(
            t`Unique values in matching rows`,
            `DistinctIf([Column], [Text] = "Done")`,
            "table-row",
          ),
          template(
            t`Average for matching rows`,
            `Average(case([Text] = "Done", [Number]))`,
            "table-row",
          ),
          template(
            t`Percentage of rows that match`,
            `Share([Text] = "Done")`,
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
            `Average(datetimeDiff([Date 1], [Date 2], "day"))`,
          ),
          template(
            t`Dates in the last N days`,
            `CountIf(interval([Date], -30, "day"))`,
          ),
          template(
            t`Dates in the next N days`,
            `CountIf(interval([Date], 7, "day"))`,
          ),
        ],
      ],
    },
    {
      name: t`Numbers`,
      icon: "math",
      blocks: [
        [template(t`Running total`, `CumulativeSum([Number])`)],
        [
          template(t`Previous period's value`, `Offset(Sum([Number]), -1)`),
          template(
            t`Change vs previous period`,
            `(Sum([Number]) - Offset(Sum([Number]), -1)) / Offset(Sum([Number]), -1)`,
          ),
          template(
            t`Rate between two counts`,
            `CountIf([Text] = "Yes") / (CountIf([Text] = "Yes") + CountIf([Text] = "No"))`,
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
