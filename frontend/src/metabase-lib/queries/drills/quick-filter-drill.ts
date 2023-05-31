import type {
  ConcreteFieldReference,
  DatasetColumn,
  FieldFilter,
  RowValue,
} from "metabase-types/api";
import { FieldLiteral, FieldReference } from "metabase-types/api";
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
import { isLocalField } from "metabase-lib/queries/utils";
import { fieldRefForColumn } from "metabase-lib/queries/utils/dataset";
import type StructuredQuery from "metabase-lib/queries/StructuredQuery";
import type { ClickObject } from "metabase-lib/queries/drills/types";
import Filter from "metabase-lib/queries/structured/Filter";
import Dimension from "metabase-lib/Dimension";

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
  const isValidFilterDimension = query
    .filterDimensionOptions()
    .all()
    .find(d => d.isEqual(columnDimension));

  const filterDimension = isValidFilterDimension ? columnDimension : null;
  const filterDimensionQuery = filterDimension?.query() || query;

  const operators = getOperatorsForColumn(column, value, filterDimension);

  const mappedOperators = operators?.map(operator => ({
    ...operator,
    filter: new Filter(operator.filter, null, filterDimensionQuery),
  }));

  return {
    query: filterDimensionQuery,
    operators: mappedOperators,
  };
}

function getOperatorsForColumn(
  column: DatasetColumn,
  value: RowValue,
  dimension?: Dimension | null,
): ColumnOperatorConfig[] | null {
  const { base_type: baseType } = column;

  if (!baseType || INVALID_TYPES.some(type => isa(baseType, type))) {
    return null;
  }

  const fieldRef = dimension
    ? dimension.mbql()
    : getColumnFieldRef(column, baseType);

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

  // this filter requires a valid dimension
  if (isString(column) && isLongText(column) && dimension) {
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

function getColumnFieldRef(
  column: DatasetColumn,
  baseType: string,
): FieldReference | null | undefined {
  if (isLocalColumn(column)) {
    return fieldRefForColumn(column);
  } else {
    const field: FieldLiteral = [
      "field",
      column.name,
      { "base-type": baseType },
    ];
    return field;
  }
}

export function quickFilterDrillQuestion({
  clicked,
  filter,
}: {
  clicked: ClickObject;
  filter: Filter;
}) {
  const dimension = filter.dimension();
  const query = filter.query();

  if (
    dimension &&
    clicked.column &&
    !isLocalColumn(clicked.column) &&
    query.topLevelQuery() === query
  ) {
    // we have to nest a query in order to add a filter for aggregation or expression on top level query
    return query.nest().filter(filter).question();
  }

  return filter.add().rootQuery().question();
}
