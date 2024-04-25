import * as A from "./aggregation";
import * as F from "./filter";

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

// we can enforce various constraints in these functions:

function setAggregationClause(query, aggregationClause) {
  return setClause("aggregation", query, aggregationClause);
}
function setFilterClause(query, filterClause) {
  return setClause("filter", query, filterClause);
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
