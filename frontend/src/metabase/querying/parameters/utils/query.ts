import { P, match } from "ts-pattern";

import { getDateFilterClause } from "metabase/querying/filters/utils/dates";
import { isNotNull } from "metabase/utils/types";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import { isTemporalUnitParameter } from "metabase-lib/v1/parameters/utils/parameter-type";
import type {
  ParameterDimensionTarget,
  ParameterTarget,
  ParameterType,
  ParameterValueOrArray,
  StructuredParameterDimensionTarget,
} from "metabase-types/api";
import {
  isDimensionTarget,
  isStructuredDimensionTarget,
} from "metabase-types/guards";

import {
  deserializeBooleanParameterValue,
  deserializeDateParameterValue,
  deserializeNumberParameterValue,
  deserializeStringParameterValue,
} from "./parsing";

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

  if (stageIndex >= Lib.stageCount(query)) {
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
  if (Lib.isStringOrStringLike(column)) {
    return getStringParameterFilterClause(type, column, value);
  }
}

function getStringParameterFilterClause(
  type: ParameterType,
  column: Lib.ColumnMetadata,
  value: ParameterValueOrArray,
): Lib.ExpressionClause | undefined {
  const values = deserializeStringParameterValue(value);
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
  const values = deserializeNumberParameterValue(type, value);
  if (values.length === 0) {
    return;
  }

  const operator = NUMBER_OPERATORS[type] ?? "=";
  return match({ operator, values })
    .with(
      { operator: P.union("=", "!="), values: P.array(P.nonNullable) },
      { operator: P.union(">=", "<="), values: [P.nonNullable] },
      { operator: "between", values: [P.nonNullable, P.nonNullable] },
      ({ values }) => Lib.numberFilterClause({ operator, column, values }),
    )
    .with(
      {
        operator: "between",
        values: P.union([P.nonNullable], [P.nonNullable, P.nullish]),
      },
      ({ values: [minValue] }) =>
        Lib.numberFilterClause({ operator: ">=", column, values: [minValue] }),
    )
    .with(
      { operator: "between", values: [P.nullish, P.nonNullable] },
      ({ values: [_minValue, maxValue] }) =>
        Lib.numberFilterClause({ operator: "<=", column, values: [maxValue] }),
    )
    .otherwise(() => undefined);
}

function getBooleanParameterFilterClause(
  type: ParameterType,
  column: Lib.ColumnMetadata,
  value: ParameterValueOrArray,
): Lib.ExpressionClause | undefined {
  const values = deserializeBooleanParameterValue(value);
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
  const filter = deserializeDateParameterValue(value);
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
  const columns = breakouts
    .map((breakout) => Lib.breakoutColumn(query, stageIndex, breakout))
    .filter(isNotNull);
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
    (bucket) => Lib.displayInfo(query, stageIndex, bucket).shortName === value,
  );
  if (!bucket) {
    return query;
  }

  const columnWithBucket = Lib.withTemporalBucket(column, bucket);
  return Lib.replaceClause(query, stageIndex, breakout, columnWithBucket);
}

export function convertParametersToMbql(
  question: Question,
  { isComposed }: { isComposed: boolean },
): Question {
  const query = question.query();
  const { isNative } = Lib.queryDisplayInfo(query);

  if (isNative) {
    return question;
  }

  // If the query is composed (models or metrics) we cannot add filters to the underlying query since that query is used for data source.
  // Pivot tables cannot work when there is an extra stage added on top of breakouts and aggregations.
  const queryWithExtraStage =
    !isComposed && question.display() !== "pivot"
      ? Lib.ensureFilterStage(query)
      : query;
  const queryWithFilters = question
    .parameters()
    .reduce((newQuery, parameter) => {
      const stageIndex =
        isDimensionTarget(parameter.target) && !isComposed
          ? getParameterDimensionTargetStageIndex(parameter.target)
          : -1;
      return applyParameter(
        newQuery,
        stageIndex,
        parameter.type,
        parameter.target ?? null,
        parameter.value ?? null,
      );
    }, queryWithExtraStage);
  const queryWithFiltersWithoutExtraStage =
    Lib.dropEmptyStages(queryWithFilters);

  const newQuestion = question
    .setQuery(queryWithFiltersWithoutExtraStage)
    .setParameters(undefined)
    .setParameterValues(undefined);

  const hasQueryBeenAltered = queryWithExtraStage !== queryWithFilters;
  return hasQueryBeenAltered ? newQuestion.markDirty() : newQuestion;
}

function getParameterDimensionTargetStageIndex(
  target: ParameterDimensionTarget,
) {
  const [_type, _variableTarget, options] = target;
  return options?.["stage-number"] ?? -1;
}
