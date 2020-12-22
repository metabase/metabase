/* @flow */

import type {
  StructuredQuery as SQ,
  Aggregation,
  AggregationClause,
  Breakout,
  BreakoutClause,
  Filter,
  FilterClause,
  LimitClause,
  OrderBy,
  OrderByClause,
  JoinClause,
  Join,
  ExpressionClause,
  ExpressionName,
  Expression,
  Field,
  FieldsClause,
} from "metabase-types/types/Query";

import * as A from "./aggregation";
import * as B from "./breakout";
import * as F from "./filter";
import * as J from "./join";
import * as L from "./limit";
import * as O from "./order_by";
import * as E from "./expression";
import * as FIELD from "./field";
import * as FIELD_REF from "./field_ref";

import _ from "underscore";

// AGGREGATION

export const getAggregations = (query: SQ) =>
  A.getAggregations(query.aggregation);
export const addAggregation = (query: SQ, aggregation: Aggregation) =>
  setAggregationClause(query, A.addAggregation(query.aggregation, aggregation));
export const updateAggregation = (
  query: SQ,
  index: number,
  aggregation: Aggregation,
) =>
  setAggregationClause(
    query,
    A.updateAggregation(query.aggregation, index, aggregation),
  );
export const removeAggregation = (query: SQ, index: number) =>
  setAggregationClause(query, A.removeAggregation(query.aggregation, index));
export const clearAggregations = (query: SQ) =>
  setAggregationClause(query, A.clearAggregations(query.aggregation));

export const isBareRows = (query: SQ) => A.isBareRows(query.aggregation);
export const hasEmptyAggregation = (query: SQ) =>
  A.hasEmptyAggregation(query.aggregation);
export const hasValidAggregation = (query: SQ) =>
  A.hasValidAggregation(query.aggregation);

// BREAKOUT

export const getBreakouts = (query: SQ) => B.getBreakouts(query.breakout);
export const addBreakout = (query: SQ, breakout: Breakout) =>
  setBreakoutClause(query, B.addBreakout(query.breakout, breakout));
export const updateBreakout = (query: SQ, index: number, breakout: Breakout) =>
  setBreakoutClause(query, B.updateBreakout(query.breakout, index, breakout));
export const removeBreakout = (query: SQ, index: number) =>
  setBreakoutClause(query, B.removeBreakout(query.breakout, index));
export const clearBreakouts = (query: SQ) =>
  setBreakoutClause(query, B.clearBreakouts(query.breakout));

// FILTER

export const getFilters = (query: SQ) => F.getFilters(query.filter);
export const addFilter = (query: SQ, filter: Filter) =>
  setFilterClause(query, F.addFilter(query.filter, filter));
export const updateFilter = (query: SQ, index: number, filter: Filter) =>
  setFilterClause(query, F.updateFilter(query.filter, index, filter));
export const removeFilter = (query: SQ, index: number) =>
  setFilterClause(query, F.removeFilter(query.filter, index));
export const clearFilters = (query: SQ) =>
  setFilterClause(query, F.clearFilters(query.filter));

export const canAddFilter = (query: SQ) => F.canAddFilter(query.filter);

// JOIN

export const getJoins = (query: SQ) => J.getJoins(query.joins);
export const addJoin = (query: SQ, join: Join) =>
  setJoinClause(query, J.addJoin(query.joins, join));
export const updateJoin = (query: SQ, index: number, join: Join) =>
  setJoinClause(query, J.updateJoin(query.joins, index, join));
export const removeJoin = (query: SQ, index: number) =>
  setJoinClause(query, J.removeJoin(query.joins, index));
export const clearJoins = (query: SQ) =>
  setJoinClause(query, J.clearJoins(query.joins));

// ORDER_BY

export const getOrderBys = (query: SQ) => O.getOrderBys(query["order-by"]);
export const addOrderBy = (query: SQ, orderBy: OrderBy) =>
  setOrderByClause(query, O.addOrderBy(query["order-by"], orderBy));
export const updateOrderBy = (query: SQ, index: number, orderBy: OrderBy) =>
  setOrderByClause(query, O.updateOrderBy(query["order-by"], index, orderBy));
export const removeOrderBy = (query: SQ, index: number) =>
  setOrderByClause(query, O.removeOrderBy(query["order-by"], index));
export const clearOrderBy = (query: SQ) =>
  setOrderByClause(query, O.clearOrderBy(query["order-by"]));

// FIELD
export const getFields = (query: SQ) => FIELD.getFields(query.fields);
export const addField = (query: SQ, field: Field) =>
  setFieldsClause(query, FIELD.addField(query.fields, field));
export const updateField = (query: SQ, index: number, field: Field) =>
  setFieldsClause(query, FIELD.updateField(query.fields, index, field));
export const removeField = (query: SQ, index: number) =>
  setFieldsClause(query, FIELD.removeField(query.fields, index));
export const clearFields = (query: SQ) =>
  setFieldsClause(query, FIELD.clearFields(query.fields));

// LIMIT

export const getLimit = (query: SQ) => L.getLimit(query.limit);
export const updateLimit = (query: SQ, limit: LimitClause) =>
  setLimitClause(query, L.updateLimit(query.limit, limit));
export const clearLimit = (query: SQ) =>
  setLimitClause(query, L.clearLimit(query.limit));

// EXPRESSIONS

export const getExpressions = (query: SQ) =>
  E.getExpressions(query.expressions);
export const getExpressionsList = (query: SQ) =>
  E.getExpressionsList(query.expressions);
export const addExpression = (
  query: SQ,
  name: ExpressionName,
  expression: Expression,
) =>
  setExpressionClause(
    query,
    E.addExpression(query.expressions, name, expression),
  );
export const updateExpression = (
  query: SQ,
  name: ExpressionName,
  expression: Expression,
  oldName: ExpressionName,
) =>
  setExpressionClause(
    query,
    E.updateExpression(query.expressions, name, expression, oldName),
  );
export const removeExpression = (query: SQ, name: ExpressionName) =>
  setExpressionClause(query, E.removeExpression(query.expressions, name));
export const clearExpressions = (query: SQ) =>
  setExpressionClause(query, E.clearExpressions(query.expressions));

// we can enforce various constraints in these functions:

function setAggregationClause(
  query: SQ,
  aggregationClause: ?AggregationClause,
): SQ {
  const wasBareRows = A.isBareRows(query.aggregation);
  const isBareRows = A.isBareRows(aggregationClause);
  // when switching to or from bare rows clear out any sorting and fields clauses
  if (isBareRows !== wasBareRows) {
    query = clearFields(query);
    query = clearOrderBy(query);
  }
  // for bare rows we always clear out any dimensions because they don't make sense
  if (isBareRows) {
    query = clearBreakouts(query);
  }
  return setClause("aggregation", query, aggregationClause);
}
function setBreakoutClause(query: SQ, breakoutClause: ?BreakoutClause): SQ {
  // NOTE: this doesn't handle complex cases
  const breakoutIds = B.getBreakouts(breakoutClause)
    .map(b => FIELD_REF.getFieldTargetId(b))
    .filter(id => id != null);
  for (const [index, sort] of getOrderBys(query).entries()) {
    const sortId = FIELD_REF.getFieldTargetId(sort[1]);
    if (sortId != null && !_.contains(breakoutIds, sortId)) {
      query = removeOrderBy(query, index);
    }
  }
  // clear fields when changing breakouts
  query = clearFields(query);
  return setClause("breakout", query, breakoutClause);
}
function setFilterClause(query: SQ, filterClause: ?FilterClause): SQ {
  return setClause("filter", query, filterClause);
}
function setJoinClause(query: SQ, joinClause: ?JoinClause): SQ {
  return setClause("joins", query, joinClause);
}
function setOrderByClause(query: SQ, orderByClause: ?OrderByClause): SQ {
  return setClause("order-by", query, orderByClause);
}
function setFieldsClause(query: SQ, fieldsClause: ?FieldsClause): SQ {
  return setClause("fields", query, fieldsClause);
}
function setLimitClause(query: SQ, limitClause: ?LimitClause): SQ {
  return setClause("limit", query, limitClause);
}
function setExpressionClause(
  query: SQ,
  expressionClause: ?ExpressionClause,
): SQ {
  if (expressionClause && Object.keys(expressionClause).length === 0) {
    expressionClause = null;
  }
  return setClause("expressions", query, expressionClause);
}

type FilterClauseName =
  | "filter"
  | "aggregation"
  | "breakout"
  | "order-by"
  | "limit"
  | "expressions"
  | "fields"
  | "joins";

function setClause(clauseName: FilterClauseName, query: SQ, clause: ?any): SQ {
  query = { ...query };
  if (clause == null) {
    delete query[clauseName];
  } else {
    query[clauseName] = clause;
  }
  return query;
}
