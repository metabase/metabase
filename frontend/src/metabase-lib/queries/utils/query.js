import * as A from "./aggregation";
import * as B from "./breakout";
import * as F from "./filter";
import * as J from "./join";
import * as O from "./order-by";
import * as E from "./expression";
import * as FIELD from "./field";
import * as FIELD_REF from "./field-ref";

// AGGREGATION
/**
 * @deprecated use MLv2
 */
export const getAggregations = query => A.getAggregations(query.aggregation);

/**
 * @deprecated use MLv2
 */
export const addAggregation = (query, aggregation) =>
  setAggregationClause(query, A.addAggregation(query.aggregation, aggregation));

/**
 * @deprecated use MLv2
 */
export const updateAggregation = (query, index, aggregation) =>
  setAggregationClause(
    query,
    A.updateAggregation(query.aggregation, index, aggregation),
  );

/**
 * @deprecated use MLv2
 */
export const removeAggregation = (query, index) =>
  setAggregationClause(query, A.removeAggregation(query.aggregation, index));

/**
 * @deprecated use MLv2
 */
export const isBareRows = query => A.isBareRows(query.aggregation);

// BREAKOUT
/**
 * @deprecated use MLv2
 */
export const getBreakouts = query => B.getBreakouts(query.breakout);

/**
 * @deprecated use MLv2
 */
export const addBreakout = (query, breakout) =>
  setBreakoutClause(query, B.addBreakout(query.breakout, breakout));

/**
 * @deprecated use MLv2
 */
export const updateBreakout = (query, index, breakout) =>
  setBreakoutClause(query, B.updateBreakout(query.breakout, index, breakout));

/**
 * @deprecated use MLv2
 */
export const removeBreakout = (query, index) =>
  setBreakoutClause(query, B.removeBreakout(query.breakout, index));

/**
 * @deprecated use MLv2
 */
const clearBreakouts = query => setBreakoutClause(query);

// FILTER

export const getFilters = query => F.getFilters(query.filter);
export const addFilter = (query, filter) =>
  setFilterClause(query, F.addFilter(query.filter, filter));
export const updateFilter = (query, index, filter) =>
  setFilterClause(query, F.updateFilter(query.filter, index, filter));
export const removeFilter = (query, index) =>
  setFilterClause(query, F.removeFilter(query.filter, index));

export const canAddFilter = query => F.canAddFilter(query.filter);

export { getFilterClause } from "./filter";

// JOIN

export const getJoins = query => J.getJoins(query.joins);
export const addJoin = (query, join) =>
  setJoinClause(query, J.addJoin(query.joins, join));

// ORDER_BY

export const getOrderBys = query => O.getOrderBys(query["order-by"]);
const updateOrderBy = (query, index, orderBy) =>
  setOrderByClause(query, O.updateOrderBy(query["order-by"], index, orderBy));
const removeOrderBy = (query, index) =>
  setOrderByClause(query, O.removeOrderBy(query["order-by"], index));
const clearOrderBy = query => setOrderByClause(query);

// FIELD
export const addField = (query, field) =>
  setFieldsClause(query, FIELD.addField(query.fields, field));
export const updateField = (query, index, field) =>
  setFieldsClause(query, FIELD.updateField(query.fields, index, field));
export const removeField = (query, index) =>
  setFieldsClause(query, FIELD.removeField(query.fields, index));
const clearFields = query => setFieldsClause(query);

// EXPRESSIONS

export const getExpressions = query => E.getExpressions(query.expressions);
export const addExpression = (query, name, expression) =>
  setExpressionClause(
    query,
    E.addExpression(query.expressions, name, expression),
  );

// we can enforce various constraints in these functions:

function setAggregationClause(query, aggregationClause) {
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
function setBreakoutClause(query, breakoutClause) {
  // NOTE: this doesn't handle complex cases
  const breakoutIds = B.getBreakouts(breakoutClause)
    .map(b => FIELD_REF.getFieldTargetId(b))
    .filter(id => id != null);
  for (const [index, sort] of getOrderBys(query).entries()) {
    const sortField = sort[1];
    const sortId = FIELD_REF.getFieldTargetId(sortField);
    if (sortId != null) {
      // Remove invalid field reference
      if (!breakoutIds.includes(sortId)) {
        query = removeOrderBy(query, index);
      } else {
        // Update the field, since it can change its binning, temporal unit, etc
        const breakoutFields = B.getBreakouts(breakoutClause);
        const breakoutField = breakoutFields.find(
          field => FIELD_REF.getFieldTargetId(field) === sortId,
        );
        if (breakoutField) {
          const direction = sort[0];
          query = updateOrderBy(query, index, [direction, breakoutField]);
        }
      }
    }
  }
  // clear fields when changing breakouts
  query = clearFields(query);
  return setClause("breakout", query, breakoutClause);
}
function setFilterClause(query, filterClause) {
  return setClause("filter", query, filterClause);
}
function setJoinClause(query, joinClause) {
  return setClause("joins", query, joinClause);
}
function setOrderByClause(query, orderByClause) {
  return setClause("order-by", query, orderByClause);
}
function setFieldsClause(query, fieldsClause) {
  return setClause("fields", query, fieldsClause);
}
function setExpressionClause(query, expressionClause) {
  if (expressionClause && Object.keys(expressionClause).length === 0) {
    expressionClause = null;
  }
  return setClause("expressions", query, expressionClause);
}

function setClause(clauseName, query, clause) {
  query = { ...query };
  if (clause == null) {
    delete query[clauseName];
  } else {
    query[clauseName] = clause;
  }
  return query;
}
