import * as ML from "cljs/metabase.lib.js";
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
