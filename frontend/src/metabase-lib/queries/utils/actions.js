import { fieldRefForColumn } from "metabase-lib/queries/utils/dataset";
import StructuredQuery from "metabase-lib/queries/StructuredQuery";

// QUESTION DRILL ACTIONS

export function aggregate(question, aggregation) {
  const query = question.legacyQuery();
  if (query instanceof StructuredQuery) {
    return query.aggregate(aggregation).question().setDefaultDisplay();
  }
}

export function breakout(question, breakout) {
  const query = question.legacyQuery();
  if (query instanceof StructuredQuery) {
    return query.breakout(breakout).question().setDefaultDisplay();
  }
}

// Adds a new filter with the specified operator, column, and value
export function filter(question, operator, column, value) {
  const query = question.legacyQuery();
  if (query instanceof StructuredQuery) {
    return query
      .filter([operator, fieldRefForColumn(column), value])
      .question();
  }
}

// STRUCTURED QUERY UTILITIES

function addOrUpdateFilter(query, newFilter) {
  // replace existing filter, if it exists
  for (const filter of query.filters()) {
    const dimension = filter.dimension();
    if (dimension && dimension.isSameBaseDimension(newFilter[1])) {
      return filter.replace(newFilter);
    }
  }
  // otherwise add a new filter
  return query.filter(newFilter);
}

export function updateLatLonFilter(
  query,
  latitudeColumn,
  longitudeColumn,
  bounds,
) {
  return addOrUpdateFilter(query, [
    "inside",
    fieldRefForColumn(latitudeColumn),
    fieldRefForColumn(longitudeColumn),
    bounds.getNorth(),
    bounds.getWest(),
    bounds.getSouth(),
    bounds.getEast(),
  ]);
}
