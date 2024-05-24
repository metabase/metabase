import { t } from "ttag";

import * as ML from "cljs/metabase.lib.js";
// TODO: fixme
import { uuid } from "metabase/lib/uuid";

import { expressionClause } from "./expression";
import { displayInfo } from "./metadata";
import type {
  Aggregable,
  AggregationClause,
  AggregationOperator,
  ColumnMetadata,
  ExpressionClause,
  FilterClause,
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

// TODO: move to different file
export function offsetClause(
  query: Query,
  stageIndex: number,
  clause: AggregationClause | ExpressionClause | FilterClause,
  offset: number,
): Query {
  const { displayName } = displayInfo(query, stageIndex, clause);
  const newName = t`${displayName} (previous period)`;
  const newClause = expressionClause("offset", [clause, offset], {
    "lib/uuid": uuid(),
    name: newName,
    "display-name": newName,
  });

  return aggregate(query, stageIndex, newClause);
}
