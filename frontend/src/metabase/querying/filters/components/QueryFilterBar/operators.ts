import type { ValueKind } from "metabase/filter-bar";
import { parseNumber } from "metabase/utils/number";
import * as Lib from "metabase-lib";

/*
 * This is mostly a copy of what the filter pickers know about columns and
 * operators: which operators each column type has, how many values they take,
 * the label variant, partial operators hidden for string-like columns, and value
 * parsing. It should be carefully extracted in a separate task into a shared
 * getFilterOperators(column) from:
 * - FilterPickerBody/FilterPickerBody.tsx (getFilterWidget)
 * - StringFilterPicker/{constants,utils}.ts
 * - NumberFilterPicker/{constants,utils}.ts
 * - CoordinateFilterPicker/{constants,utils}.ts
 * - DefaultFilterPicker/{constants,utils}.ts
 * - querying/common/components/BooleanPicker
 */

type Operator = Lib.FilterOperator & Lib.ExpressionOperator;
type ColumnKind = "string" | "number" | "coordinate" | "boolean" | "default";

const EQUALITY: [Operator, ValueKind][] = [
  ["=", "multi"],
  ["!=", "multi"],
];
const COMPARISON: [Operator, ValueKind][] = [
  [">", "single"],
  [">=", "single"],
  ["<", "single"],
  ["<=", "single"],
];
const NULLS: [Operator, ValueKind][] = [
  ["is-null", "none"],
  ["not-null", "none"],
];
const PARTIAL_OPERATORS: [Operator, ValueKind][] = [
  ["contains", "single"],
  ["does-not-contain", "single"],
  ["starts-with", "single"],
  ["ends-with", "single"],
];
const PARTIAL = new Set<string>(PARTIAL_OPERATORS.map(([key]) => key));
const BOOLEANS: Record<string, boolean> = { true: true, false: false };

const OPERATORS: Record<ColumnKind, [Operator, ValueKind][][]> = {
  string: [
    EQUALITY,
    PARTIAL_OPERATORS,
    [
      ["is-empty", "none"],
      ["not-empty", "none"],
    ],
  ],
  number: [[["between", "range"]], EQUALITY, COMPARISON, NULLS],
  coordinate: [[["between", "range"]], EQUALITY, COMPARISON],
  boolean: [[["=", "single"]], NULLS],
  default: [NULLS],
};

const getColumnKind = (column: Lib.ColumnMetadata): ColumnKind | null => {
  if (Lib.isBoolean(column)) {
    return "boolean";
  }
  if (Lib.isTemporal(column)) {
    return null;
  }
  if (Lib.isNumeric(column)) {
    return Lib.isCoordinate(column) ? "coordinate" : "number";
  }
  return Lib.isStringOrStringLike(column) ? "string" : "default";
};

export const getOperators = (column: Lib.ColumnMetadata) => {
  const kind = getColumnKind(column);
  if (!kind) {
    return null;
  }
  const isKey = Lib.isPrimaryKey(column) || Lib.isForeignKey(column);
  const variant = kind === "number" && !isKey ? "number" : "default";
  const isPartialHidden = Lib.isStringLike(column);
  return OPERATORS[kind]
    .map((group) =>
      group
        .filter(([key]) => !isPartialHidden || !PARTIAL.has(key))
        .map(([key, valueKind]) => ({
          key,
          label: Lib.describeFilterOperator(key, variant),
          valueKind,
          operator: key,
          options: PARTIAL.has(key) ? { "case-sensitive": false } : {},
        })),
    )
    .filter((group) => group.length > 0);
};

export const parseValue = (column: Lib.ColumnMetadata, value: string) => {
  const kind = getColumnKind(column);
  if (kind === "number" || kind === "coordinate") {
    return parseNumber(value);
  }
  return kind === "boolean" ? (BOOLEANS[value.toLowerCase()] ?? null) : value;
};

export const findOperator = (column: Lib.ColumnMetadata, key: string) =>
  getOperators(column)
    ?.flat()
    .find((operator) => operator.key === key);
