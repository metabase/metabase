import { to_array } from "cljs/cljs.core";
import {
  available_aggregation_operators,
  aggregation_operator_columns,
  aggregate as _aggregate,
  aggregations as _aggregations,
  aggregation_clause,
  selected_aggregation_operators,
} from "cljs/metabase.lib.aggregation";
import type {
  AggregationClause,
  AggregationOperator,
  ColumnMetadata,
  Query,
} from "./types";

export function availableAggregationOperators(
  query: Query,
  stageIndex: number,
): AggregationOperator[] {
  return to_array(available_aggregation_operators(query, stageIndex));
}

export function aggregationOperatorColumns(
  operator: AggregationOperator,
): ColumnMetadata[] {
  return to_array(aggregation_operator_columns(operator));
}

export function selectedAggregationOperators(
  operators: AggregationOperator[],
  clause: AggregationClause,
): AggregationOperator[] {
  return to_array(selected_aggregation_operators(operators, clause));
}

export function aggregate(
  query: Query,
  stageIndex: number,
  clause: AggregationClause,
): Query {
  return _aggregate(query, stageIndex, clause);
}

export function aggregations(
  query: Query,
  stageIndex: number,
): AggregationClause[] {
  return to_array(_aggregations(query, stageIndex));
}

export function aggregationClause(
  operator: AggregationOperator,
  column?: ColumnMetadata,
): AggregationClause {
  return aggregation_clause(operator, column);
}
