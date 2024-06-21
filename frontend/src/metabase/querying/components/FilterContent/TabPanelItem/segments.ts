import * as Lib from "metabase-lib";

import type { SegmentItem } from "../types";

export function addSegmentFilters(
  query: Lib.Query,
  segmentItems: SegmentItem[],
) {
  return segmentItems.reduce((query, { segment, stageIndex }) => {
    return Lib.filter(query, stageIndex, segment);
  }, query);
}

export function removeSegmentFilters(
  query: Lib.Query,
  segmentItems: SegmentItem[],
) {
  const filterGroups = segmentItems.map(({ stageIndex, filterPositions }) => {
    const filters = Lib.filters(query, stageIndex);
    return {
      filters: filterPositions.map(filterPosition => filters[filterPosition]),
      stageIndex,
    };
  });

  return filterGroups.reduce((query, { filters, stageIndex }) => {
    return filters.reduce(
      (newQuery, filter) => Lib.removeClause(newQuery, stageIndex, filter),
      query,
    );
  }, query);
}
