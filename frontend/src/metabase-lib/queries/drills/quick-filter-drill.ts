import type { ClickObject } from "metabase-types/types/Visualization";
import type { FilterClause, OrderableValue } from "metabase-types/types/Query";
import type { DatasetColumn, RowValue } from "metabase-types/api";
import {
  isa,
  isBoolean,
  isDate,
  isNumeric,
  isTypeFK,
  isTypePK,
} from "metabase-lib/types/utils/isa";
import { TYPE } from "metabase-lib/types/constants";
import { isLocalField } from "metabase-lib/queries/utils";
import { fieldRefForColumn } from "metabase-lib/queries/utils/dataset";
import type Question from "metabase-lib/Question";
import StructuredQuery from "metabase-lib/queries/StructuredQuery";

const INVALID_TYPES = [TYPE.Structured];

export type QuickFilterOperatorType = "<" | ">" | "=" | "≠";

type QuickFilterDrillOperator = {
  name: QuickFilterOperatorType;
  filter: FilterClause;
};
export type QuickFilterDataValueType =
  | "null"
  | "date"
  | "numeric"
  | "boolean"
  | "text";

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

  return getOperatorsForColumn(column, value);
}

export function quickFilterDrillQuestion({
  question,
  clicked,
  filter,
}: {
  question: Question;
  clicked: ClickObject;
  filter: FilterClause;
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

function getOperatorsForColumn(
  column: DatasetColumn,
  value: RowValue,
): {
  operators: QuickFilterDrillOperator[];
  valueType: QuickFilterDataValueType;
} | null {
  const fieldRef = getColumnFieldRef(column);

  if (
    INVALID_TYPES.some(type => column.base_type && isa(column.base_type, type))
  ) {
    return null;
  } else if (value == null) {
    return {
      valueType: "null",
      operators: [
        { name: "=", filter: ["is-null", fieldRef] },
        { name: "≠", filter: ["not-null", fieldRef] },
      ],
    };
  } else if (isNumeric(column) || isDate(column)) {
    return {
      valueType: isDate(column) ? "date" : "numeric",
      operators: [
        { name: "<", filter: ["<", fieldRef, value as OrderableValue] },
        { name: ">", filter: [">", fieldRef, value as OrderableValue] },
        { name: "=", filter: ["=", fieldRef, value] },
        { name: "≠", filter: ["!=", fieldRef, value] },
      ],
    };
  } else {
    return {
      valueType: isBoolean(column) ? "boolean" : "text",
      operators: [
        { name: "=", filter: ["=", fieldRef, value] },
        { name: "≠", filter: ["!=", fieldRef, value] },
      ],
    };
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
