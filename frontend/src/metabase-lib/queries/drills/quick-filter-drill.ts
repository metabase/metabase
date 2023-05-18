import type {
  ConcreteFieldReference,
  DatasetColumn,
  FieldFilter,
  RowValue,
} from "metabase-types/api";
import { FieldReference } from "metabase-types/api";
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
import type Question from "metabase-lib/Question";
import type StructuredQuery from "metabase-lib/queries/StructuredQuery";
import type { ClickObject } from "metabase-lib/queries/drills/types";
import Filter from "metabase-lib/queries/structured/Filter";
import type Dimension from "metabase-lib/Dimension";

const INVALID_TYPES = [TYPE.Structured];
const isConcreteField = (
  fieldRef: FieldReference,
): fieldRef is ConcreteFieldReference => {
  const [type] = fieldRef;

  return type === "field" || type === "expression";
};

export type QuickFilterOperatorType =
  | "<"
  | ">"
  | "="
  | "≠"
  | "contains"
  | "does-not-contain";

export type QuickFilterDrillOperator =
  | { valueType: "null" | "boolean"; name: "=" | "≠" }
  | {
      valueType: "numeric" | "date";
      name: "=" | "≠" | "<" | ">";
    }
  | {
      valueType: "text";
      name: "=" | "≠" | "contains" | "does-not-contain";
    };

type ColumnOperatorConfig = QuickFilterDrillOperator & {
  filter: FieldFilter;
};

type DrillOperator = QuickFilterDrillOperator & {
  filter: Filter;
};

export function quickFilterDrill({
  question,
  clicked,
}: {
  question: Question;
  clicked: ClickObject | undefined;
}): {
  query: StructuredQuery;
  operators: DrillOperator[] | undefined;
} | null {
  const query = question.query() as StructuredQuery;
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

  const columnDimension = query.dimensionForColumn(column);
  if (!columnDimension) {
    return null;
  }

  const filterDimensionQuery = columnDimension.query() || query;
  const operators = getOperatorsForColumn(columnDimension, value, column);

  return {
    query: query,
    operators: operators?.map(operator => ({
      ...operator,
      filter: new Filter(operator.filter, null, filterDimensionQuery),
    })),
  };
}

function getOperatorsForColumn(
  dimension: Dimension,
  value: RowValue,
  column: DatasetColumn,
): ColumnOperatorConfig[] | null {
  if (
    INVALID_TYPES.some(type => column.base_type && isa(column.base_type, type))
  ) {
    return null;
  }

  const fieldRef = dimension.mbql();
  if (!fieldRef || !isConcreteField(fieldRef)) {
    return null;
  }

  if (value == null) {
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

export function quickFilterDrillQuestion(filter: Filter) {
  return filter.add().rootQuery().question();
}
