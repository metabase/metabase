import { t } from "ttag";
import * as Lib from "metabase-lib";
import type { GroupItem } from "./types";

function getStageIndexes(query: Lib.Query) {
  const stageCount = Lib.stageCount(query);
  return stageCount > 1 ? [-2, -1] : [-1];
}

export function getColumnGroupItems(query: Lib.Query): GroupItem[] {
  const stageIndexes = getStageIndexes(query);
  return stageIndexes.flatMap(stageIndex => {
    const columns = Lib.filterableColumns(query, stageIndex);
    const groups = Lib.groupColumns(columns);

    return groups.map(group => {
      const groupInfo = Lib.displayInfo(query, stageIndex, group);
      const columns = Lib.getColumnsFromColumnGroup(group);

      return {
        key: groupInfo.name ?? String(stageIndex),
        group,
        groupInfo,
        columns,
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

export function getModalTitle(groupItems: GroupItem[]) {
  return groupItems.length === 1
    ? t`Filter ${groupItems[0].groupInfo.displayName} by`
    : t`Filter by`;
}

export function getModalWidth(groupItems: GroupItem[]) {
  const maxWidth = groupItems.length > 1 ? "70rem" : "55rem";
  return `min(98vw, ${maxWidth})`;
}
