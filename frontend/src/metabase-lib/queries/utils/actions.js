import { fieldRefForColumn } from "metabase-lib/queries/utils/dataset";

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
