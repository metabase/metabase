import { to_array } from "cljs/cljs.core";
import {
  available_aggregation_operators,
  aggregation_operator_columns,
  aggregate as _aggregate,
  aggregations as _aggregations,
  aggregation_clause,
} from "cljs/metabase.lib.aggregation";
import type {
  AggregationClause,
  AggregationOperator,
  ColumnMetadata,
  Query,
} from "./types";

const DEFAULT_STAGE_INDEX = -1;

export function availableAggregationOperators(
  query: Query,
  stageIndex = DEFAULT_STAGE_INDEX,
): AggregationOperator[] {
  return to_array(available_aggregation_operators(query, stageIndex));
}

export function aggregationOperatorColumns(
  operator: AggregationOperator,
): ColumnMetadata[] {
  return to_array(aggregation_operator_columns(operator));
}

declare function Aggregate(query: Query, clause: AggregationClause): Query;
declare function Aggregate(
  query: Query,
  stageIndex: number,
  clause: AggregationClause,
): Query;

export const aggregate: typeof Aggregate = _aggregate;

export function aggregations(
  query: Query,
  stageIndex = DEFAULT_STAGE_INDEX,
): AggregationClause[] {
  return to_array(_aggregations(query, stageIndex));
}

export function aggregationClause(
  operator: AggregationOperator,
  column?: ColumnMetadata,
): AggregationClause {
  return aggregation_clause(operator, column);
}
