import * as F from "./filter";

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
