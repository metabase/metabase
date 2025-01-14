import { P, match } from "ts-pattern";

import { getDateFilterClause } from "metabase/querying/filters/utils/dates";
import * as Lib from "metabase-lib";
import { isTemporalUnitParameter } from "metabase-lib/v1/parameters/utils/parameter-type";
import type {
  ParameterTarget,
  ParameterType,
  ParameterValueOrArray,
  StructuredParameterDimensionTarget,
} from "metabase-types/api";
import { isStructuredDimensionTarget } from "metabase-types/guards";

import {
  normalizeBooleanParameterValue,
  normalizeDateParameterValue,
  normalizeNumberParameterValue,
  normalizeStringParameterValue,
} from "./normalize";

const STRING_OPERATORS: Partial<
  Record<ParameterType, Lib.StringFilterOperator>
> = {
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
  "string/=": "=",
  "number/=": "=",
  "number/!=": "!=",
  "string/!=": "!=",
  "number/>=": ">=",
  "number/<=": "<=",
  "number/between": "between",
};

const BOOLEAN_OPERATORS: Partial<
  Record<ParameterType, Lib.ExpressionOperator>
> = {
  "string/=": "=",
  "string/!=": "!=",
};

export function applyParameter(
  query: Lib.Query,
  stageIndex: number,
  type: ParameterType,
  target: ParameterTarget | null,
  value: ParameterValueOrArray | null,
) {
  if (target == null || value == null || !isStructuredDimensionTarget(target)) {
    return query;
  }

  if (isTemporalUnitParameter(type)) {
    return applyTemporalUnitParameter(query, stageIndex, target, value);
  } else {
    return applyFilterParameter(query, stageIndex, type, target, value);
  }
}

function applyFilterParameter(
  query: Lib.Query,
  stageIndex: number,
  type: ParameterType,
  target: StructuredParameterDimensionTarget,
  value: ParameterValueOrArray,
): Lib.Query {
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
  target: StructuredParameterDimensionTarget,
) {
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
  if (Lib.isDateOrDateTime(column)) {
    return getDateParameterFilterClause(column, value);
  }
  if (Lib.isBoolean(column)) {
    return getBooleanParameterFilterClause(type, column, value);
  }
  if (Lib.isNumeric(column)) {
    return getNumberParameterFilterClause(type, column, value);
  }
  if (Lib.isString(column)) {
    return getStringParameterFilterClause(type, column, value);
  }
}

function getStringParameterFilterClause(
  type: ParameterType,
  column: Lib.ColumnMetadata,
  value: ParameterValueOrArray,
): Lib.ExpressionClause | undefined {
  const values = normalizeStringParameterValue(value);
  if (values.length === 0) {
    return;
  }

  const operator = STRING_OPERATORS[type] ?? "=";
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
  const values = normalizeNumberParameterValue(value);
  if (values.length === 0) {
    return;
  }

  const operator = NUMBER_OPERATORS[type] ?? "=";
  return match({ operator, values })
    .with(
      { operator: P.union("=", "!=") },
      { operator: P.union(">=", "<="), values: [P.number] },
      { operator: "between", values: [P.number, P.number] },
      () => Lib.numberFilterClause({ operator, column, values }),
    )
    .otherwise(() => undefined);
}

function getBooleanParameterFilterClause(
  type: ParameterType,
  column: Lib.ColumnMetadata,
  value: ParameterValueOrArray,
): Lib.ExpressionClause | undefined {
  const values = normalizeBooleanParameterValue(value);
  if (values.length === 0) {
    return;
  }

  const operator = BOOLEAN_OPERATORS[type] ?? "=";
  return Lib.expressionClause(operator, [column, ...values]);
}

function getDateParameterFilterClause(
  column: Lib.ColumnMetadata,
  value: ParameterValueOrArray,
): Lib.ExpressionClause | undefined {
  const filter = normalizeDateParameterValue(value);
  if (filter == null) {
    return;
  }

  return getDateFilterClause(column, filter);
}

function applyTemporalUnitParameter(
  query: Lib.Query,
  stageIndex: number,
  target: StructuredParameterDimensionTarget,
  value: ParameterValueOrArray,
): Lib.Query {
  const breakouts = Lib.breakouts(query, stageIndex);
  const columns = breakouts.map(breakout =>
    Lib.breakoutColumn(query, stageIndex, breakout),
  );
  const columnRef = target[1];
  const [columnIndex] = Lib.findColumnIndexesFromLegacyRefs(
    query,
    stageIndex,
    columns,
    [columnRef],
  );
  if (columnIndex < 0) {
    return query;
  }

  const column = columns[columnIndex];
  const breakout = breakouts[columnIndex];
  const buckets = Lib.availableTemporalBuckets(query, stageIndex, column);
  const bucket = buckets.find(
    bucket => Lib.displayInfo(query, stageIndex, bucket).shortName === value,
  );
  if (!bucket) {
    return query;
  }

  const columnWithBucket = Lib.withTemporalBucket(column, bucket);
  return Lib.replaceClause(query, stageIndex, breakout, columnWithBucket);
}
