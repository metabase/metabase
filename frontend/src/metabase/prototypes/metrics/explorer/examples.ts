import type {
  BooleanFilterOperator,
  NumberFilterOperator,
  StringFilterOperator,
} from "metabase-lib/common";
import * as LibMetric from "metabase-lib/metric";
import type { IconName } from "metabase-types/api";

import { type BarItem, DRAFT_PREFIX, matchesItem } from "./TokenBar";
import {
  type FormulaToken,
  type MetricDraft,
  type Op,
  newKey,
} from "./formula";

/**
 * The Sample Database measures created for this prototype on the local
 * instance, by name. The list endpoint doesn't return tables, so they live here.
 */
export const MEASURE_TABLES: Record<string, string> = {
  Revenue: "Orders",
  Discounts: "Orders",
  Tax: "Orders",
  Orders: "Orders",
  "Units sold": "Orders",
  "New customers": "People",
  "New accounts": "Accounts",
  Seats: "Accounts",
  Payments: "Invoices",
  Reviews: "Reviews",
};

type Kind = "string" | "number" | "boolean";

/** A column a filter can read, by the label the bar shows. */
type ColumnSpec = {
  label: string;
  table: string;
  column: string;
  /** For a column reached through a foreign key, like Product → Category. */
  via?: string;
  kind: Kind;
  /** Values to suggest, like a category's. */
  values?: string[];
};

const COLUMNS: ColumnSpec[] = [
  { label: "Total", table: "Orders", column: "Total", kind: "number" },
  { label: "Subtotal", table: "Orders", column: "Subtotal", kind: "number" },
  { label: "Tax", table: "Orders", column: "Tax", kind: "number" },
  { label: "Discount", table: "Orders", column: "Discount", kind: "number" },
  { label: "Quantity", table: "Orders", column: "Quantity", kind: "number" },
  {
    label: "Product category",
    table: "Orders",
    via: "Product",
    column: "Category",
    kind: "string",
    values: ["Doohickey", "Gadget", "Gizmo", "Widget"],
  },
  {
    label: "Source",
    table: "People",
    column: "Source",
    kind: "string",
    values: ["Affiliate", "Facebook", "Google", "Organic", "Twitter"],
  },
  {
    label: "Plan",
    table: "Accounts",
    column: "Plan",
    kind: "string",
    values: ["Basic", "Business", "Premium"],
  },
  { label: "Seats", table: "Accounts", column: "Seats", kind: "number" },
  {
    label: "Trial converted",
    table: "Accounts",
    column: "Trial Converted",
    kind: "boolean",
  },
  {
    label: "Active subscription",
    table: "Accounts",
    column: "Active Subscription",
    kind: "boolean",
  },
  {
    label: "Plan",
    table: "Invoices",
    column: "Plan",
    kind: "string",
    values: ["Basic", "Business", "Premium"],
  },
  { label: "Payment", table: "Invoices", column: "Payment", kind: "number" },
  { label: "Rating", table: "Reviews", column: "Rating", kind: "number" },
  // Columns reached through a foreign key, so other tables share them.
  {
    label: "Source",
    table: "Orders",
    via: "User",
    column: "Source",
    kind: "string",
    values: ["Affiliate", "Facebook", "Google", "Organic", "Twitter"],
  },
  {
    label: "Product category",
    table: "Reviews",
    via: "Product",
    column: "Category",
    kind: "string",
    values: ["Doohickey", "Gadget", "Gizmo", "Widget"],
  },
  {
    label: "Country",
    table: "Accounts",
    column: "Country",
    kind: "string",
  },
  {
    label: "Country",
    table: "Invoices",
    via: "Account",
    column: "Country",
    kind: "string",
  },
];

/** The column each measure adds up, offered first when filtering it. */
const MEASURE_COLUMNS: Record<string, string> = {
  Revenue: "Total",
  Discounts: "Discount",
  Tax: "Tax",
  "Units sold": "Quantity",
  Seats: "Seats",
  Payments: "Payment",
};

type OpSpec = {
  /** What the pill shows, like "≥". */
  symbol: string;
  label: string;
  /** Typed shortcuts, like ">=". */
  aliases?: string[];
  operator: {
    string?: StringFilterOperator;
    number?: NumberFilterOperator;
    boolean?: BooleanFilterOperator;
  };
  hasValue: boolean;
};

const OPERATORS: OpSpec[] = [
  {
    symbol: "=",
    label: "is",
    operator: { string: "=", number: "=", boolean: "=" },
    hasValue: true,
  },
  {
    symbol: "≠",
    label: "is not",
    aliases: ["!="],
    operator: { string: "!=", number: "!=" },
    hasValue: true,
  },
  {
    symbol: ">",
    label: "is greater than",
    operator: { number: ">" },
    hasValue: true,
  },
  {
    symbol: "≥",
    label: "is greater than or equal to",
    aliases: [">="],
    operator: { number: ">=" },
    hasValue: true,
  },
  {
    symbol: "<",
    label: "is less than",
    operator: { number: "<" },
    hasValue: true,
  },
  {
    symbol: "≤",
    label: "is less than or equal to",
    aliases: ["<="],
    operator: { number: "<=" },
    hasValue: true,
  },
  {
    symbol: "contains",
    label: "contains",
    operator: { string: "contains" },
    hasValue: true,
  },
  {
    symbol: "is empty",
    label: "is empty",
    operator: { string: "is-empty", number: "is-null" },
    hasValue: false,
  },
  {
    symbol: "is not empty",
    label: "is not empty",
    operator: { string: "not-empty", number: "not-null" },
    hasValue: false,
  },
];

const KIND_ICONS: Record<Kind, IconName> = {
  string: "string",
  number: "int",
  boolean: "io",
};

const normalize = (text: string) =>
  text.replace(/>=/g, "≥").replace(/<=/g, "≤").replace(/!=/g, "≠");

/** Words need a break after them ("Plan" isn't "Planet"); symbols don't. */
const startsWithWord = (text: string, word: string) =>
  text.toLowerCase().startsWith(word.toLowerCase()) &&
  (!/[a-z]$/i.test(word) ||
    text.length === word.length ||
    /^[\s=≠<>≤≥]/.test(text.slice(word.length)));

type Draft = {
  column?: ColumnSpec;
  op?: OpSpec;
  /** The text after the column, or after the operator. */
  rest: string;
};

/** Reads typed text, like "Total > 1", into its parts as far as they go. */
function parseDraft(columns: ColumnSpec[], query: string): Draft {
  const text = normalize(query).trimStart();
  const column = [...columns]
    .sort((a, b) => b.label.length - a.label.length)
    .find((candidate) => startsWithWord(text, candidate.label));
  if (!column) {
    return { rest: text };
  }
  const afterColumn = text.slice(column.label.length).trimStart();
  const op = OPERATORS.filter((candidate) => candidate.operator[column.kind])
    .sort((a, b) => b.symbol.length - a.symbol.length)
    .find((candidate) => startsWithWord(afterColumn, candidate.symbol));
  if (!op) {
    return { column, rest: afterColumn };
  }
  return { column, op, rest: afterColumn.slice(op.symbol.length).trim() };
}

const labelOf = (column: ColumnSpec, op: OpSpec, value = "") =>
  op.hasValue
    ? `${column.label} ${op.symbol} ${value}`
    : `${column.label} ${op.symbol}`;

/**
 * The dropdown for a filter being typed, as in the filter bar: a column, then
 * an operator, then a value. Picking a column or an operator fills the input.
 */
export function suggestFilters(
  tables: string[],
  query: string,
  exclude: string[] = [],
  measureName?: string,
): BarItem[] {
  // Only the columns every table has, one per label: a filter on the whole
  // metric has to apply to each of its measures.
  const columns = COLUMNS.filter(
    (column, index) =>
      tables.includes(column.table) &&
      tables.every((table) =>
        COLUMNS.some((c) => c.table === table && c.label === column.label),
      ) &&
      COLUMNS.findIndex(
        (c) => c.label === column.label && tables.includes(c.table),
      ) === index,
  );
  const { column, op, rest } = parseDraft(columns, query);
  const measureColumn = measureName && MEASURE_COLUMNS[measureName];

  if (!column) {
    const ordered = [
      ...columns.filter((c) => c.label === measureColumn),
      ...columns.filter((c) => c.label !== measureColumn),
    ];
    return ordered
      .map(
        (c): BarItem => ({
          id: `${DRAFT_PREFIX}${c.label} `,
          label: c.label,
          icon: KIND_ICONS[c.kind],
          aliases: c.label === measureColumn ? [measureName ?? ""] : [],
          section: tables.length > 1 ? "Shared by all measures" : undefined,
          sectionIcon: "table",
        }),
      )
      .filter((item) => matchesItem(item, rest));
  }

  if (!op) {
    return OPERATORS.filter((candidate) => candidate.operator[column.kind])
      .map(
        (candidate): BarItem => ({
          id: candidate.hasValue
            ? `${DRAFT_PREFIX}${labelOf(column, candidate)}`
            : labelOf(column, candidate),
          label: candidate.label,
          hint: candidate.symbol.length <= 2 ? candidate.symbol : undefined,
          aliases: [candidate.symbol, ...(candidate.aliases ?? [])],
          section: column.label,
          sectionIcon: KIND_ICONS[column.kind],
        }),
      )
      .filter(
        (item) =>
          !exclude.includes(item.id) &&
          (rest === "" || matchesItem({ ...item, section: undefined }, rest)),
      );
  }

  if (!op.hasValue) {
    const id = labelOf(column, op);
    return exclude.includes(id) ? [] : [{ id, label: id, icon: "filter" }];
  }

  const known =
    column.kind === "boolean" ? ["true", "false"] : (column.values ?? []);
  const valueItems = known
    .filter((value) => value.toLowerCase().includes(rest.toLowerCase()))
    .map(
      (value): BarItem => ({
        id: labelOf(column, op, value),
        label: value,
        section: `${column.label} ${op.label}`,
        sectionIcon: "filter",
      }),
    );
  const isTyped =
    rest !== "" &&
    !known.some((value) => value.toLowerCase() === rest.toLowerCase()) &&
    (column.kind !== "number" || !Number.isNaN(Number(rest)));
  const typedItem: BarItem[] = isTyped
    ? [
        {
          id: labelOf(column, op, rest),
          label: labelOf(column, op, rest),
          icon: "filter",
        },
      ]
    : [];
  const items = [...typedItem, ...valueItems].filter(
    (item) => !exclude.includes(item.id),
  );
  return items.length > 0
    ? items
    : [
        {
          id: "hint:value",
          label: column.kind === "number" ? "Type a number" : "Type a value",
          disabled: true,
        },
      ];
}

const isSpecDimension = (
  definition: LibMetric.MetricDefinition,
  dimension: LibMetric.DimensionMetadata,
  spec: ColumnSpec,
) => {
  const info = LibMetric.displayInfo(definition, dimension);
  const sameColumn =
    info.displayName.toLowerCase() === spec.column.toLowerCase();
  const sameGroup =
    spec.via == null
      ? info.group?.type !== "connection"
      : info.group?.displayName.toLowerCase() === spec.via.toLowerCase();
  return sameColumn && sameGroup;
};

const buildClause = (
  column: ColumnSpec,
  op: OpSpec,
  value: string,
  dimension: LibMetric.DimensionMetadata,
) => {
  const values = op.hasValue ? [value] : [];
  switch (column.kind) {
    case "string":
      return LibMetric.stringFilterClause({
        operator: op.operator.string ?? "=",
        dimension,
        values,
        options: {},
      });
    case "number":
      return LibMetric.numberFilterClause({
        operator: op.operator.number ?? "=",
        dimension,
        values: values.map(Number),
      });
    case "boolean":
      return LibMetric.booleanFilterClause({
        operator: op.operator.boolean ?? "=",
        dimension,
        values: values.map((v) => v === "true"),
      });
  }
};

/**
 * The definition with the labelled filters added, read like "Total > 1". A
 * filter on a column the measure's table doesn't have is skipped.
 */
export function applyFilters(
  definition: LibMetric.MetricDefinition,
  labels: string[],
): LibMetric.MetricDefinition {
  return labels.reduce((current, label) => {
    const dimensions = LibMetric.filterableDimensions(current);
    const columns = COLUMNS.filter((column) =>
      dimensions.some((d) => isSpecDimension(current, d, column)),
    );
    const { column, op, rest } = parseDraft(columns, label);
    const dimension =
      column &&
      dimensions.find((candidate) =>
        isSpecDimension(current, candidate, column),
      );
    if (!column || !op || !dimension || (op.hasValue && rest === "")) {
      return current;
    }
    return LibMetric.filter(current, buildClause(column, op, rest, dimension));
  }, definition);
}

/** A measure by name, an operator, a parenthesis, or a measure with filters. */
type Part = string | { measure: string; filters: string[] };

export type MetricExample = {
  id: string;
  name: string;
  /** What the example shows, on hover. */
  hint: string;
  formula: Part[];
  where: string[];
};

export const EXAMPLES: MetricExample[] = [
  {
    id: "net-revenue",
    name: "Net revenue",
    hint: "Math over three measures from one table.",
    formula: ["Revenue", "−", "Discounts", "−", "Tax"],
    where: [],
  },
  {
    id: "gross-billings",
    name: "Gross billings",
    hint: "Mixed operators: adds one measure, subtracts another.",
    formula: ["Revenue", "+", "Tax", "−", "Discounts"],
    where: [],
  },
  {
    id: "average-order-value",
    name: "Average order value",
    hint: "A ratio of two measures.",
    formula: ["Revenue", "÷", "Orders"],
    where: [],
  },
  {
    id: "discounted-order-share",
    name: "Share of orders with a discount",
    hint: "The same measure twice, one with its own filter.",
    formula: [
      { measure: "Orders", filters: ["Discount is not empty"] },
      "÷",
      "Orders",
    ],
    where: [],
  },
  {
    id: "trial-conversion-rate",
    name: "Trial conversion rate",
    hint: "A rate: accounts that converted out of all new accounts.",
    formula: [
      { measure: "New accounts", filters: ["Trial converted = true"] },
      "÷",
      "New accounts",
    ],
    where: [],
  },
  {
    id: "gizmo-average-order-value",
    name: "Gizmo average order value",
    hint: "A filter on the whole metric, in the Where row.",
    formula: ["Revenue", "÷", "Orders"],
    where: ["Product category = Gizmo"],
  },
  {
    id: "revenue-per-new-customer",
    name: "Revenue per new customer",
    hint: "Measures from two tables, Orders and People: which date column does each one use?",
    formula: ["Revenue", "÷", "New customers"],
    where: [],
  },
];

const OPS: Record<string, Op> = { "+": "+", "−": "−", "×": "×", "÷": "÷" };

/** The example as a draft, with the measures' ids on this instance. */
export function exampleDraft(
  example: MetricExample,
  idOf: (measureName: string) => string,
): MetricDraft {
  const formula = example.formula.map((part): FormulaToken => {
    if (typeof part === "object") {
      return {
        key: newKey(),
        kind: "term",
        measureId: idOf(part.measure),
        filters: part.filters,
      };
    }
    if (part === "(" || part === ")") {
      return { key: newKey(), kind: "paren", side: part };
    }
    if (part in OPS) {
      return { key: newKey(), kind: "op", op: OPS[part] };
    }
    return { key: newKey(), kind: "term", measureId: idOf(part), filters: [] };
  });
  return {
    name: example.name,
    formula,
    where: example.where.map((filter) => ({ key: newKey(), filter })),
  };
}
