import type { DatasetColumn, FieldFilter, RowValue } from "metabase-types/api";
import {
  isa,
  isBoolean,
  isDate,
  isLongText,
  isNumeric,
  isString,
  isTypeFK,
  isTypePK,
} from "metabase-lib/types/utils/isa";
import { TYPE } from "metabase-lib/types/constants";
import { isLocalField } from "metabase-lib/queries/utils";
import { fieldRefForColumn } from "metabase-lib/queries/utils/dataset";
import type Question from "metabase-lib/Question";
import type StructuredQuery from "metabase-lib/queries/StructuredQuery";
import type { ClickObject } from "metabase-lib/queries/drills/types";

const INVALID_TYPES = [TYPE.Structured];

export type QuickFilterOperatorType =
  | "<"
  | ">"
  | "="
  | "≠"
  | "contains"
  | "does-not-contain";

export type QuickFilterDrillOperator =
  | { valueType: "null" | "boolean"; name: "=" | "≠"; filter: FieldFilter }
  | {
      valueType: "numeric" | "date";
      name: "=" | "≠" | "<" | ">";
      filter: FieldFilter;
    }
  | {
      valueType: "text";
      name: "=" | "≠" | "contains" | "does-not-contain";
      filter: FieldFilter;
    };

export function quickFilterDrill({
  question,
  clicked,
}: {
  question: Question;
  clicked: ClickObject | undefined;
}) {
  const query = question.query();
  if (
    !question.isStructured() ||
    !query.isEditable() ||
    !clicked ||
    !clicked.column ||
    clicked.value === undefined
  ) {
    return null;
  }

  const { column, value } = clicked;
  if (isTypePK(column.semantic_type) || isTypeFK(column.semantic_type)) {
    return null;
  }

  return {
    query: query as StructuredQuery,
    operators: getOperatorsForColumn(column, value),
  };
}

function getOperatorsForColumn(
  column: DatasetColumn,
  value: RowValue,
): QuickFilterDrillOperator[] | null {
  const fieldRef = getColumnFieldRef(column);

  if (
    INVALID_TYPES.some(type => column.base_type && isa(column.base_type, type))
  ) {
    return null;
  } else if (value == null) {
    const valueType = "null";

    return [
      { name: "=", valueType, filter: ["is-null", fieldRef] },
      { name: "≠", valueType, filter: ["not-null", fieldRef] },
    ];
  } else if (isNumeric(column) || isDate(column)) {
    const typedValue = value as string | number;
    const valueType = isDate(column) ? "date" : "numeric";

    return [
      { name: "<", valueType, filter: ["<", fieldRef, typedValue] },
      { name: ">", valueType, filter: [">", fieldRef, typedValue] },
      { name: "=", valueType, filter: ["=", fieldRef, typedValue] },
      { name: "≠", valueType, filter: ["!=", fieldRef, typedValue] },
    ];
  }
  if (isString(column) && isLongText(column)) {
    const typedValue = value as string;
    const valueType = "text";

    return [
      {
        name: "contains",
        valueType,
        filter: ["contains", fieldRef, typedValue],
      },
      {
        name: "does-not-contain",
        valueType,
        filter: ["does-not-contain", fieldRef, typedValue],
      },
    ];
  } else {
    const valueType = isBoolean(column) ? "boolean" : "text";

    return [
      { name: "=", valueType, filter: ["=", fieldRef, value] },
      { name: "≠", valueType, filter: ["!=", fieldRef, value] },
    ];
  }
}

function isLocalColumn(column: DatasetColumn) {
  return isLocalField(column.field_ref);
}

function getColumnFieldRef(column: DatasetColumn) {
  if (isLocalColumn(column)) {
    return fieldRefForColumn(column);
  } else {
    return ["field", column.name, { "base-type": column.base_type }];
  }
}

export function quickFilterDrillQuestion({
  question,
  clicked,
  filter,
}: {
  question: Question;
  clicked: ClickObject;
  filter: FieldFilter;
}) {
  const { column } = clicked;

  const query = question.query() as StructuredQuery; // we check this in quickFilterDrill function

  if (column && isLocalColumn(column)) {
    return query.filter(filter).question();
  } else {
    /**
     * For aggregated and custom columns
     * with field refs like ["aggregation", 0],
     * we need to nest the query as filters like ["=", ["aggregation", 0], value] won't work
     *
     * So the query like
     * {
     *   aggregations: [["count"]]
     *   source-table: 2,
     * }
     *
     * Becomes
     * {
     *   source-query: {
     *      aggregations: [["count"]]
     *     source-table: 2,
     *   },
     *   filter: ["=", [ "field", "count", {"base-type": "type/BigInteger"} ], value]
     * }
     */
    return query.nest().filter(filter).question();
  }
}
