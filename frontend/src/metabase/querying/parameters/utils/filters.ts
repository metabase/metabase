import { getDateFilterClause } from "metabase/querying/filters/utils/dates";
import * as Lib from "metabase-lib";
import {
  isCategoryParameter,
  isDateParameter,
  isNumberParameter,
  isStringParameter,
} from "metabase-lib/v1/parameters/utils/parameter-type";
import type {
  ParameterTarget,
  ParameterType,
  ParameterValueOrArray,
} from "metabase-types/api";

import { deserializeDateFilter } from "./dates";

const STRING_OPERATORS: Partial<
  Record<ParameterType, Lib.StringFilterOperator>
> = {
  category: "=",
  "string/=": "=",
  "string/!=": "!=",
  "string/contains": "contains",
  "string/does-not-contain": "does-not-contain",
  "string/starts-with": "starts-with",
  "string/ends-with": "ends-with",
};

const NUMBER_OPERATORS: Partial<
  Record<ParameterType, Lib.NumberFilterOperator>
> = {
  category: "=",
  "number/=": "=",
  "number/!=": "!=",
  "number/>=": ">=",
  "number/<=": "<=",
  "number/between": "between",
};

export function applyFilterParameter(
  query: Lib.Query,
  stageIndex: number,
  type: ParameterType,
  target: ParameterTarget,
  value: ParameterValueOrArray,
): Lib.Query {
  if (target == null || value == null) {
    return query;
  }

  const column = getParameterFilterColumn(query, stageIndex, target);
  if (column == null) {
    return query;
  }

  const filter = getParameterFilterClause(type, column, value);
  if (filter == null) {
    return query;
  }

  return Lib.filter(query, stageIndex, filter);
}

function getParameterFilterColumn(
  query: Lib.Query,
  stageIndex: number,
  target: ParameterTarget,
) {
  if (target[0] !== "dimension" || target[1][0] === "template-tag") {
    return;
  }

  const columnRef = target[1];
  const columns = Lib.filterableColumns(query, stageIndex);
  const [columnIndex] = Lib.findColumnIndexesFromLegacyRefs(
    query,
    stageIndex,
    columns,
    [columnRef],
  );
  if (columnIndex < 0) {
    return;
  }

  return columns[columnIndex];
}

function getParameterFilterClause(
  type: ParameterType,
  column: Lib.ColumnMetadata,
  value: ParameterValueOrArray,
) {
  if (isStringParameter(type) || isCategoryParameter(type)) {
    if (Lib.isBoolean(column)) {
      return getBooleanParameterFilterClause(type, column, value);
    } else if (Lib.isNumeric(column)) {
      return getNumberParameterFilterClause(type, column, value);
    } else if (Lib.isString(column)) {
      return getStringParameterFilterClause(type, column, value);
    }
  }

  if (isNumberParameter(type) && Lib.isNumeric(column)) {
    return getNumberParameterFilterClause(type, column, value);
  }

  if (isDateParameter(type) && Lib.isDateOrDateTime(column)) {
    return getDateParameterFilterClause(column, value);
  }
}

function getValueAsArray(value: ParameterValueOrArray) {
  const array = Array.isArray(value) ? value : [value];
  return array.filter(item => item != null);
}

function getStringParameterFilterClause(
  type: ParameterType,
  column: Lib.ColumnMetadata,
  value: ParameterValueOrArray,
): Lib.ExpressionClause | undefined {
  const operator = STRING_OPERATORS[type];
  if (operator == null) {
    return;
  }

  const values = getValueAsArray(value)
    .map(String)
    .filter(value => value.length > 0);
  if (values.length === 0) {
    return;
  }

  return Lib.stringFilterClause({
    operator,
    column,
    values,
    options: { caseSensitive: false },
  });
}

function getNumberParameterFilterClause(
  type: ParameterType,
  column: Lib.ColumnMetadata,
  value: ParameterValueOrArray,
): Lib.ExpressionClause | undefined {
  const operator = NUMBER_OPERATORS[type];
  if (operator == null) {
    return;
  }

  const values = getValueAsArray(value)
    .map(value => parseFloat(String(value)))
    .filter(value => isFinite(value));
  if (values.length === 0) {
    return;
  }

  return Lib.numberFilterClause({ operator, column, values });
}

function getBooleanParameterFilterClause(
  type: ParameterType,
  column: Lib.ColumnMetadata,
  value: ParameterValueOrArray,
): Lib.ExpressionClause | undefined {
  const values = getValueAsArray(value)
    .filter(value => typeof value === "boolean")
    .map(Boolean);
  if (values.length !== 1) {
    return;
  }

  switch (type) {
    case "category":
    case "string/=":
      return Lib.booleanFilterClause({ operator: "=", column, values });
    case "string/!=":
      return Lib.booleanFilterClause({
        operator: "=",
        column,
        values: values.map(value => !value),
      });
  }
}

function getDateParameterFilterClause(
  column: Lib.ColumnMetadata,
  value: ParameterValueOrArray,
): Lib.ExpressionClause | undefined {
  if (typeof value !== "string") {
    return;
  }

  const filter = deserializeDateFilter(value);
  if (filter == null) {
    return;
  }

  return getDateFilterClause(column, filter);
}
