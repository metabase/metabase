import type {
  TestAggregationSpec,
  TestBreakoutSpec,
  TestColumnSpec,
} from "metabase-types/api";

import {
  type DynamicQueryInput,
  type QueryInput,
  isMeasureReference,
  isMetricReference,
  isNamedAggregation,
  isTableInput,
} from "./input-guards";
import type {
  QuestionSchema,
  SchemaJavaScriptType,
  TableSchema,
} from "./schema";

const ORDERABLE_JAVASCRIPT_TYPES: readonly SchemaJavaScriptType[] = [
  "string",
  "number",
  "boolean",
  "Date",
];

export function getAggregationResultColumnDefaultName(
  operator: string,
): string {
  return operator === "distinct" ? "count" : operator;
}

export function getAggregationResultColumnJavaScriptType(
  operator: string,
  dimensionJavaScriptType: SchemaJavaScriptType | undefined,
): SchemaJavaScriptType {
  const isOrderableDimension =
    dimensionJavaScriptType !== undefined &&
    ORDERABLE_JAVASCRIPT_TYPES.includes(dimensionJavaScriptType);

  return (operator === "min" || operator === "max") && isOrderableDimension
    ? dimensionJavaScriptType
    : "number";
}

export function getAggregationResultColumnNames(
  aggregations: readonly TestAggregationSpec[] = [],
): string[] {
  return aggregations.flatMap((aggregation) => {
    if (isNamedAggregation(aggregation)) {
      return [aggregation.name];
    }

    if (isMeasureReference(aggregation) || isMetricReference(aggregation)) {
      return (aggregation.columns ?? []).map(({ name }) => name);
    }

    if (aggregation.type === "operator") {
      return [
        aggregation.name ??
          getAggregationResultColumnDefaultName(aggregation.operator),
      ];
    }

    return [];
  });
}

function getSourceResultColumnNames(
  source: TableSchema | QuestionSchema,
): string[] {
  const columns =
    source.columns ??
    (source.type === "table" ? Object.values(source.fields ?? {}) : []);

  return columns.map(({ name }) => name);
}

function getBreakoutResultColumnNames(
  breakouts: readonly TestBreakoutSpec[],
): string[] {
  return breakouts.flatMap(({ name }) => name ?? []);
}

function getFieldResultColumnNames(
  fields: readonly TestColumnSpec[],
): string[] {
  return fields.flatMap(({ name }) => name ?? []);
}

function getStageResultColumnNames(
  stage: QueryInput | DynamicQueryInput | undefined,
  inputNames: string[],
): string[] {
  if (stage === undefined) {
    return inputNames;
  }

  const { breakouts = [], aggregations = [] } = stage;

  if (breakouts.length > 0 || aggregations.length > 0) {
    return [
      ...getBreakoutResultColumnNames(breakouts),
      ...getAggregationResultColumnNames(aggregations),
    ];
  }

  const fieldNames = isTableInput(stage)
    ? getFieldResultColumnNames(stage.fields ?? [])
    : [];

  return fieldNames.length > 0 ? fieldNames : inputNames;
}

export function getQueryResultColumnNames(
  query: QueryInput,
  dynamicQuery?: DynamicQueryInput,
): string[] {
  return getStageResultColumnNames(
    dynamicQuery,
    getStageResultColumnNames(query, getSourceResultColumnNames(query.source)),
  );
}
