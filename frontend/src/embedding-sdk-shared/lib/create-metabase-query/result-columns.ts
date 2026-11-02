import {
  type AggregationInput,
  type DynamicQueryInput,
  type QueryInput,
  isNamedAggregation,
  isTableInput,
} from "./input-guards";
import type { QuestionSchema, TableSchema } from "./schema";

export function isCountAggregation(aggregation: AggregationInput) {
  return (
    !isNamedAggregation(aggregation) &&
    aggregation.type === "operator" &&
    aggregation.operator === "count" &&
    aggregation.args?.length === 0
  );
}

export function getAggregationResultColumnNames(
  aggregations: readonly AggregationInput[] = [],
): string[] {
  return aggregations.flatMap((aggregation) => {
    if (isNamedAggregation(aggregation)) {
      return [aggregation.name];
    }

    // Metrics and Measures also carry a `name`, but it is their title, not a
    // result column name.
    if (aggregation.type === "operator" && aggregation.name !== undefined) {
      return [aggregation.name];
    }

    if (isCountAggregation(aggregation)) {
      return ["count"];
    }

    return (aggregation.columns ?? []).map(({ name }) => name);
  });
}

function getSourceColumnNames(source: TableSchema | QuestionSchema): string[] {
  const columns =
    source.columns ??
    (source.type === "table" ? Object.values(source.fields ?? {}) : []);

  return columns.map(({ name }) => name);
}

function getStageColumnNames(
  stage: QueryInput | DynamicQueryInput | undefined,
  inputNames: string[],
): string[] {
  if (stage === undefined) {
    return inputNames;
  }

  const { breakouts = [], aggregations = [] } = stage;

  if (breakouts.length > 0 || aggregations.length > 0) {
    return [
      ...breakouts.flatMap(({ name }) => name ?? []),
      ...getAggregationResultColumnNames(aggregations),
    ];
  }

  const fieldNames = isTableInput(stage)
    ? (stage.fields ?? []).flatMap(({ name }) => name ?? [])
    : [];

  return fieldNames.length > 0 ? fieldNames : inputNames;
}

export function getQueryResultColumnNames(
  query: QueryInput,
  dynamicQuery?: DynamicQueryInput,
): string[] {
  return getStageColumnNames(
    dynamicQuery,
    getStageColumnNames(query, getSourceColumnNames(query.source)),
  );
}
