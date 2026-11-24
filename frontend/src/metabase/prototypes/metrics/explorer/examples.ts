import type {
  BooleanFilterOperator,
  NumberFilterOperator,
  StringFilterOperator,
} from "metabase-lib/common";
import * as LibMetric from "metabase-lib/metric";

import type { BarItem } from "./TokenBar";
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

type FilterSpec = {
  label: string;
  table: string;
  column: string;
  /** For a column reached through a foreign key, like Product → Category. */
  via?: string;
} & (
  | { kind: "string"; operator: StringFilterOperator; values: string[] }
  | { kind: "number"; operator: NumberFilterOperator; values: number[] }
  | { kind: "boolean"; operator: BooleanFilterOperator; values: boolean[] }
);

/** Real filters on the Sample Database, applied to the measures' definitions. */
const FILTER_SPECS: FilterSpec[] = [
  {
    label: "Product category = Gizmo",
    table: "Orders",
    via: "Product",
    column: "Category",
    kind: "string",
    operator: "=",
    values: ["Gizmo"],
  },
  {
    label: "Product category = Widget",
    table: "Orders",
    via: "Product",
    column: "Category",
    kind: "string",
    operator: "=",
    values: ["Widget"],
  },
  {
    label: "Discount is not empty",
    table: "Orders",
    column: "Discount",
    kind: "number",
    operator: "not-null",
    values: [],
  },
  {
    label: "Quantity ≥ 5",
    table: "Orders",
    column: "Quantity",
    kind: "number",
    operator: ">=",
    values: [5],
  },
  {
    label: "Source = Affiliate",
    table: "People",
    column: "Source",
    kind: "string",
    operator: "=",
    values: ["Affiliate"],
  },
  {
    label: "Source = Google",
    table: "People",
    column: "Source",
    kind: "string",
    operator: "=",
    values: ["Google"],
  },
  {
    label: "Trial converted = true",
    table: "Accounts",
    column: "Trial Converted",
    kind: "boolean",
    operator: "=",
    values: [true],
  },
  {
    label: "Active subscription = true",
    table: "Accounts",
    column: "Active Subscription",
    kind: "boolean",
    operator: "=",
    values: [true],
  },
  {
    label: "Plan = Business",
    table: "Accounts",
    column: "Plan",
    kind: "string",
    operator: "=",
    values: ["Business"],
  },
  {
    label: "Plan = Premium",
    table: "Invoices",
    column: "Plan",
    kind: "string",
    operator: "=",
    values: ["Premium"],
  },
  {
    label: "Rating ≥ 4",
    table: "Reviews",
    column: "Rating",
    kind: "number",
    operator: ">=",
    values: [4],
  },
];

const toItem = (spec: FilterSpec): BarItem => ({
  id: spec.label,
  label: spec.label,
  icon: "filter",
  section: spec.table,
  sectionIcon: "table",
});

/** Filters on the given tables, as dropdown options. */
export const filterItemsFor = (tables: string[]) =>
  FILTER_SPECS.filter((spec) => tables.includes(spec.table)).map(toItem);

const isSpecDimension = (
  definition: LibMetric.MetricDefinition,
  dimension: LibMetric.DimensionMetadata,
  spec: FilterSpec,
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
  spec: FilterSpec,
  dimension: LibMetric.DimensionMetadata,
) => {
  switch (spec.kind) {
    case "string":
      return LibMetric.stringFilterClause({
        operator: spec.operator,
        dimension,
        values: spec.values,
        options: {},
      });
    case "number":
      return LibMetric.numberFilterClause({
        operator: spec.operator,
        dimension,
        values: spec.values,
      });
    case "boolean":
      return LibMetric.booleanFilterClause({
        operator: spec.operator,
        dimension,
        values: spec.values,
      });
  }
};

/**
 * The definition with the labelled filters added. A filter on a column the
 * measure's table doesn't have is skipped, like a Where on another table.
 */
export function applyFilters(
  definition: LibMetric.MetricDefinition,
  labels: string[],
): LibMetric.MetricDefinition {
  return labels.reduce((current, label) => {
    const spec = FILTER_SPECS.find((candidate) => candidate.label === label);
    const dimension =
      spec &&
      LibMetric.filterableDimensions(current).find((candidate) =>
        isSpecDimension(current, candidate, spec),
      );
    return spec && dimension
      ? LibMetric.filter(current, buildClause(spec, dimension))
      : current;
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
