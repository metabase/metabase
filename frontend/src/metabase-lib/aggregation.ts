import {
  aggregation_clause,
  aggregation_column,
  aggregation_operator_columns,
  available_aggregation_operators,
  aggregate as cljs_aggregate,
  aggregations as cljs_aggregations,
  selected_aggregation_operators,
} from "cljs/metabase.lib.js";

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
  return available_aggregation_operators(query, stageIndex);
}

export function aggregationOperatorColumns(
  operator: AggregationOperator,
): ColumnMetadata[] {
  return aggregation_operator_columns(operator);
}

export function selectedAggregationOperators(
  operators: AggregationOperator[],
  clause: AggregationClause,
): AggregationOperator[] {
  return selected_aggregation_operators(operators, clause);
}

export function aggregate(
  query: Query,
  stageIndex: number,
  clause: Aggregable,
): Query {
  return cljs_aggregate(query, stageIndex, clause);
}

export function aggregateByCount(query: Query, stageIndex: number): Query {
  const operators = availableAggregationOperators(query, stageIndex);
  const countOperator = operators.find((operator) => {
    const info = displayInfo(query, stageIndex, operator);
    return info.shortName === "count";
  });

  if (!countOperator) {
    return query;
  }

  const aggregation = aggregationClause(countOperator);
  return aggregate(query, stageIndex, aggregation);
}

export function aggregations(
  query: Query,
  stageIndex: number,
): AggregationClause[] {
  return cljs_aggregations(query, stageIndex);
}

export function aggregationClause(
  operator: AggregationOperator,
  column?: ColumnMetadata,
): AggregationClause {
  return aggregation_clause(operator, column);
}

export function aggregationColumn(
  query: Query,
  stageIndex: number,
  aggregation: AggregationClause,
): ColumnMetadata {
  return aggregation_column(query, stageIndex, aggregation);
}
