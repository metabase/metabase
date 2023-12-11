import { t } from "ttag";
import * as Lib from "metabase-lib";
import type { ColumnGroupItem } from "./types";

export function appendStageIfAggregated(query: Lib.Query) {
  const aggregations = Lib.aggregations(query, -1);
  const breakouts = Lib.breakouts(query, -1);

  return aggregations.length > 0 && breakouts.length > 0
    ? Lib.appendStage(query)
    : query;
}

export function dropStageIfEmpty(query: Lib.Query) {
  return Lib.dropStageIfEmpty(query, -1);
}

function getStageIndexes(query: Lib.Query) {
  const stageCount = Lib.stageCount(query);
  return stageCount > 1 ? [-2, -1] : [-1];
}

export function getGroupItems(query: Lib.Query): ColumnGroupItem[] {
  const stageIndexes = getStageIndexes(query);
  return stageIndexes.flatMap(stageIndex => {
    const columns = Lib.filterableColumns(query, stageIndex);
    const groups = Lib.groupColumns(columns);

    return groups.map(group => {
      const groupInfo = Lib.displayInfo(query, stageIndex, group);
      const columns = Lib.getColumnsFromColumnGroup(group);
      const columnItems = columns.map(column => ({
        column,
        columnInfo: Lib.displayInfo(query, stageIndex, column),
      }));

      return {
        key: groupInfo.name ?? String(stageIndex),
        group,
        groupInfo,
        columnItems,
        stageIndex,
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

export function getModalTitle(groupItems: ColumnGroupItem[]) {
  return groupItems.length === 1
    ? t`Filter ${groupItems[0].groupInfo.displayName} by`
    : t`Filter by`;
}

export function getModalWidth(groupItems: ColumnGroupItem[]) {
  const maxWidth = groupItems.length > 1 ? "70rem" : "55rem";
  return `min(98vw, ${maxWidth})`;
}
