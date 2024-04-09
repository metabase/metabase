import { t } from "ttag";

import {
  getColumnGroupIcon,
  getColumnGroupName,
} from "metabase/common/utils/column-groups";
import * as Lib from "metabase-lib";

import type { GroupItem, SegmentItem } from "../types";

export function appendStageIfAggregated(query: Lib.Query) {
  const aggregations = Lib.aggregations(query, -1);
  const breakouts = Lib.breakouts(query, -1);

  return aggregations.length > 0 && breakouts.length > 0
    ? Lib.appendStage(query)
    : query;
}

function getStageIndexes(query: Lib.Query) {
  const stageCount = Lib.stageCount(query);
  return stageCount > 1 ? [-2, -1] : [-1];
}

export function getGroupItems(query: Lib.Query): GroupItem[] {
  const stageIndexes = getStageIndexes(query);
  return stageIndexes.flatMap(stageIndex => {
    const columns = Lib.filterableColumns(query, stageIndex);
    const groups = Lib.groupColumns(columns);
    const segments = Lib.availableSegments(query, stageIndex);

    return groups.map((group, groupIndex) => {
      const groupInfo = Lib.displayInfo(query, stageIndex, group);
      const availableColumns = Lib.getColumnsFromColumnGroup(group);
      const availableSegments = groupIndex === 0 ? segments : [];

      return {
        key: groupInfo.name ?? String(stageIndex),
        displayName: getColumnGroupName(groupInfo) || t`Summaries`,
        icon: getColumnGroupIcon(groupInfo) || "sum",
        columnItems: availableColumns.map(column => {
          const columnInfo = Lib.displayInfo(query, stageIndex, column);
          return {
            column,
            displayName: columnInfo.displayName,
            stageIndex,
          };
        }),
        segmentItems: availableSegments.map(segment => {
          const segmentInfo = Lib.displayInfo(query, stageIndex, segment);
          return {
            segment,
            displayName: segmentInfo.displayName,
            stageIndex,
            filterPositions: segmentInfo.filterPositions ?? [],
          };
        }),
      };
    });
  });
}

export function hasFilters(query: Lib.Query) {
  const stageIndexes = getStageIndexes(query);
  const filters = stageIndexes.flatMap(stageIndex =>
    Lib.filters(query, stageIndex),
  );
  return filters.length > 0;
}

export function removeFilters(query: Lib.Query) {
  const stageIndexes = getStageIndexes(query);
  return stageIndexes.reduce(
    (newQuery, stageIndex) => Lib.removeFilters(newQuery, stageIndex),
    query,
  );
}

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

export function findColumnFilters(
  query: Lib.Query,
  stageIndex: number,
  column: Lib.ColumnMetadata,
): Lib.FilterClause[] {
  const filters = Lib.filters(query, stageIndex);
  const { filterPositions } = Lib.displayInfo(query, stageIndex, column);
  return filterPositions != null
    ? filterPositions.map(index => filters[index])
    : [];
}

export function findVisibleFilters(
  filters: Lib.FilterClause[],
  initialFilterCount: number,
): (Lib.FilterClause | undefined)[] {
  return Array(Math.max(filters.length, initialFilterCount, 1))
    .fill(undefined)
    .map((_, i) => filters[i]);
}
