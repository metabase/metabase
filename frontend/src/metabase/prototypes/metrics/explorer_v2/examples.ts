import type {
  BooleanFilterOperator,
  NumberFilterOperator,
  StringFilterOperator,
} from "metabase-lib/common";
import * as LibMetric from "metabase-lib/metric";
import type { IconName } from "metabase-types/api";

import { type BarItem, DRAFT_PREFIX, matchesItem } from "./TokenBar";
import {
  COLUMNS,
  type ColumnSpec,
  type Kind,
  MEASURE_TABLES,
  SEGMENT_PREFIX,
  type SegmentSpec,
} from "./catalog";
import { type Dimension, EMPTY_MAPPING } from "./dimensions";
import {
  type FormulaToken,
  type MetricDraft,
  type Op,
  newKey,
} from "./formula";
import { EMPTY_PANEL } from "./panelModel";

export { MEASURE_TABLES };

/** Dates are dimensions too, but this bar has no operators for them yet. */
type FilterKind = Exclude<Kind, "date">;

/** What the bar needs of a column or a dimension to filter by it. */
type FilterField = { label: string; kind: FilterKind; values?: string[] };

type FilterColumn = ColumnSpec & { kind: FilterKind };

const FILTER_COLUMNS: FilterColumn[] = COLUMNS.flatMap((column) =>
  column.kind === "date" ? [] : [{ ...column, kind: column.kind }],
);

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

const KIND_ICONS: Record<FilterKind, IconName> = {
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

type Draft<T extends FilterField> = {
  column?: T;
  op?: OpSpec;
  /** The text after the column, or after the operator. */
  rest: string;
};

/** Reads typed text, like "Total > 1", into its parts as far as they go. */
function parseDraft<T extends FilterField>(
  columns: T[],
  query: string,
): Draft<T> {
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

const labelOf = (column: FilterField, op: OpSpec, value = "") =>
  op.hasValue
    ? `${column.label} ${op.symbol} ${value}`
    : `${column.label} ${op.symbol}`;

type SuggestOptions = {
  /** The dimension to offer first, like the column a measure adds up. */
  first?: string;
  /** Another text that finds the first dimension, like the measure's name. */
  alias?: string;
  /** A heading above the dimensions. */
  section?: string;
  /** A line under the dimensions, on why there aren't more. */
  hint?: string;
  /** Dimensions only some pills have: typing one says where to filter it. */
  unshared?: { label: string; pills: string[] }[];
  /** The named filters of the pill's table, offered before its columns. */
  segments?: SegmentSpec[];
};

/**
 * The dropdown for a filter being typed, as in the filter bar: a dimension,
 * then an operator, then a value. Picking a dimension or an operator fills
 * the input.
 */
export function suggestFilters(
  dimensions: Dimension[],
  query: string,
  exclude: string[] = [],
  {
    first,
    alias,
    section,
    hint,
    unshared = [],
    segments = [],
  }: SuggestOptions = {},
): BarItem[] {
  const columns = dimensions.flatMap((dimension): FilterField[] =>
    dimension.kind === "date"
      ? []
      : [
          {
            label: dimension.label,
            kind: dimension.kind,
            values: dimension.values,
          },
        ],
  );
  const { column, op, rest } = parseDraft(columns, query);

  if (!column) {
    const ordered = [
      ...columns.filter((c) => c.label === first),
      ...columns.filter((c) => c.label !== first),
    ];
    const named = segments
      .map(
        (segment): BarItem => ({
          id: `${SEGMENT_PREFIX}${segment.name}`,
          label: segment.name,
          icon: "segment",
          description: segment.filter,
          section: "Segments",
          sectionIcon: "segment",
        }),
      )
      .filter(
        (item) =>
          !exclude.includes(item.id) &&
          matchesItem({ ...item, section: undefined }, rest),
      );
    const items = ordered
      .map(
        (c): BarItem => ({
          id: `${DRAFT_PREFIX}${c.label} `,
          label: c.label,
          icon: KIND_ICONS[c.kind],
          aliases: c.label === first && alias ? [alias] : [],
          section:
            section ?? (segments.length > 0 ? "Or by a column" : undefined),
          sectionIcon: "table",
        }),
      )
      // The heading is the same for all of them, so it mustn't match.
      .filter((item) => matchesItem({ ...item, section: undefined }, rest));
    const elsewhere = unshared
      .filter(
        ({ label }) =>
          rest !== "" &&
          (startsWithWord(rest, label) ||
            label.toLowerCase().startsWith(rest.toLowerCase())),
      )
      .map(
        ({ label, pills }): BarItem => ({
          id: `hint:unshared:${label}`,
          label: `${label} is only on ${pills.join(" and ")}. Filter that measure instead.`,
          disabled: true,
        }),
      );
    const why: BarItem[] = hint
      ? [{ id: "hint:dimensions", label: hint, disabled: true }]
      : [];
    return [...named, ...items, ...elsewhere, ...why];
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
  column: FilterColumn,
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
    const columns = FILTER_COLUMNS.filter((column) =>
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

/**
 * A measure by name, an operator, a parenthesis, a measure with filters, or
 * another example used as a pill, by id.
 */
type Part =
  | string
  | { measure: string; filters: string[] }
  | { metric: string; filters: string[] };

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
    formula: ["Revenue", "÷", "Orders count"],
    where: [],
  },
  {
    id: "discounted-order-share",
    name: "Share of orders with a discount",
    hint: "The same measure twice, one filtered by a segment.",
    formula: [
      { measure: "Orders count", filters: ["segment:Discounted orders"] },
      "÷",
      "Orders count",
    ],
    where: [],
  },
  {
    id: "trial-conversion-rate",
    name: "Trial conversion rate",
    hint: "A rate: accounts that converted out of all new accounts.",
    formula: [
      { measure: "New accounts", filters: ["segment:Converted trials"] },
      "÷",
      "New accounts",
    ],
    where: [],
  },
  {
    id: "gizmo-average-order-value",
    name: "Gizmo average order value",
    hint: "The same segment on each measure.",
    formula: [
      { measure: "Revenue", filters: ["segment:Gizmo orders"] },
      "÷",
      { measure: "Orders count", filters: ["segment:Gizmo orders"] },
    ],
    where: [],
  },
  {
    id: "revenue-per-new-customer",
    name: "Revenue per new customer",
    hint: "Measures from two tables, Orders and People: which date column does each one use?",
    formula: ["Revenue", "÷", "New customers"],
    where: [],
  },
  {
    id: "large-order-revenue-per-new-customer",
    name: "Large-order revenue per new customer",
    hint: "Two tables, one side filtered: the segment is on Orders, so it sits on Revenue's own pill.",
    formula: [
      { measure: "Revenue", filters: ["segment:Large orders"] },
      "÷",
      "New customers",
    ],
    where: [],
  },
  {
    id: "large-gizmo-revenue-share",
    name: "Revenue share of large Gizmo orders",
    hint: "Two segments on one pill: both have to hold.",
    formula: [
      {
        measure: "Revenue",
        filters: ["segment:Large orders", "segment:Gizmo orders"],
      },
      "÷",
      "Revenue",
    ],
    where: [],
  },
  {
    id: "google-revenue-per-new-customer",
    name: "Google revenue per new customer",
    hint: "A metric over two tables used as one pill, filtered by a dimension both tables share.",
    formula: [
      { metric: "revenue-per-new-customer", filters: ["Source = Google"] },
    ],
    where: [],
  },
  {
    id: "revenue-per-new-account",
    name: "Revenue per new account",
    hint: "Two unrelated tables, Orders and Accounts: only time matches.",
    formula: ["Revenue", "÷", "New accounts"],
    where: [],
  },
  {
    id: "review-rate",
    name: "Review rate",
    hint: "Reviews per order: two tables that meet only through Products, so Product category is a real shared dimension.",
    formula: ["Reviews count", "÷", "Orders count"],
    where: [],
  },
  {
    id: "bad-reviews-per-order",
    name: "Bad reviews per order",
    hint: "Rating is only on Reviews, so the filter sits on the Reviews pill and Orders stays unfiltered.",
    formula: [
      { measure: "Reviews count", filters: ["Rating ≤ 2"] },
      "÷",
      "Orders count",
    ],
    where: [],
  },
  {
    id: "gizmo-review-rate",
    name: "Gizmo review rate",
    hint: "A filter on the whole metric: Product category is the same column on both sides.",
    formula: ["Reviews count", "÷", "Orders count"],
    where: ["Product category = Gizmo"],
  },
];

/** The examples offered as pills: metrics that are math over measures. */
export const COMPOSITE_IDS = [
  "average-order-value",
  "revenue-per-new-customer",
  "review-rate",
];

export const COMPOSITE_PREFIX = "composite:";

/** Every measure the example reads, also through the metrics it uses. */
export const measuresOf = (example: MetricExample): string[] => [
  ...new Set(
    example.formula.flatMap((part): string[] => {
      if (typeof part === "string") {
        return part in MEASURE_TABLES ? [part] : [];
      }
      if ("measure" in part) {
        return [part.measure];
      }
      const inner = EXAMPLES.find(({ id }) => id === part.metric);
      return inner ? measuresOf(inner) : [];
    }),
  ),
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
        measureId:
          "measure" in part
            ? idOf(part.measure)
            : `${COMPOSITE_PREFIX}${part.metric}`,
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
    mapping: EMPTY_MAPPING,
    panel: EMPTY_PANEL,
  };
}
