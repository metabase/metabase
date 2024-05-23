import * as ML from "cljs/metabase.lib.js";

import { expressionParts } from "./expression";
import { displayInfo } from "./metadata";
import type {
  Aggregable,
  AggregationClause,
  AggregationOperator,
  ColumnMetadata,
  Query,
} from "./types";

export function availableAggregationOperators(
  query: Query,
  stageIndex: number,
): AggregationOperator[] {
  return ML.available_aggregation_operators(query, stageIndex);
}

export function aggregationOperatorColumns(
  operator: AggregationOperator,
): ColumnMetadata[] {
  return ML.aggregation_operator_columns(operator);
}

export function selectedAggregationOperators(
  operators: AggregationOperator[],
  clause: AggregationClause,
): AggregationOperator[] {
  return ML.selected_aggregation_operators(operators, clause);
}

export function aggregate(
  query: Query,
  stageIndex: number,
  clause: Aggregable,
): Query {
  return ML.aggregate(query, stageIndex, clause);
}

export function aggregations(
  query: Query,
  stageIndex: number,
): AggregationClause[] {
  return ML.aggregations(query, stageIndex);
}

export function aggregationClause(
  operator: AggregationOperator,
  column?: ColumnMetadata,
): AggregationClause {
  return ML.aggregation_clause(operator, column);
}

export function aggregationColumn(
  query: Query,
  stageIndex: number,
  aggregation: AggregationClause,
): ColumnMetadata {
  return ML.aggregation_column(query, stageIndex, aggregation);
}

export function aggregateByCount(query: Query): Query {
  const stageIndex = -1;
  const operators = availableAggregationOperators(query, stageIndex);
  const countOperator = operators.find(operator => {
    const info = displayInfo(query, stageIndex, operator);
    return info.shortName === "count";
  });

  if (!countOperator) {
    return query;
  }

  const aggregation = aggregationClause(countOperator);
  return aggregate(query, stageIndex, aggregation);
}

export function aggregateOffset(
  query: Query,
  stageIndex: number,
  aggregationClause: AggregationClause,
): Query {
  const { operator, options, args } = expressionParts(
    query,
    stageIndex,
    aggregationClause,
  );

  return query;
}
