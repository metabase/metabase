import * as ML from "cljs/metabase.lib.js";
import { Expression } from "metabase-types/api";
import type { ColumnMetadata, Query } from "./types";

export function expressions(query: Query): Expression[] {
  return ML.expressions(query);
}

export function expressionableColumns(
  query: Query,
  expressionPosition: number,
): ColumnMetadata[] {
  return ML.expressionable_columns(query, expressionPosition);
}

export function addExpression(
  query: Query,
  stageIndex: number,
  expressionName: string,
  expression: Expression,
): Query {
  // Change cljc fn to addExpression?
  return ML.expression(query, expressionName, expression);
}
