import { t } from "ttag";
import * as Lib from "metabase-lib";
import type { GroupItem } from "./types";

export function getColumnGroupItems(query: Lib.Query): GroupItem[] {
  const stageCount = Lib.stageCount(query);
  const stageIndexes = stageCount > 1 ? [-1, -2] : [-1];

  return stageIndexes.flatMap(stageIndex => {
    const columns = Lib.filterableColumns(query, stageIndex);
    const groups = Lib.groupColumns(columns);

    return groups.map(group => {
      const groupInfo = Lib.displayInfo(query, stageIndex, group);
      const columns = Lib.getColumnsFromColumnGroup(group);

      return {
        key: groupInfo.name ?? "",
        group,
        groupInfo,
        columns,
        stageIndex,
      };
    });
  });
}

export function findFilterClause(
  query: Lib.Query,
  stageIndex: number,
  filterColumn: Lib.ColumnMetadata,
): Lib.FilterClause | undefined {
  const filters = Lib.filters(query, stageIndex);
  const { filterPositions } = Lib.displayInfo(query, stageIndex, filterColumn);
  return filterPositions != null && filterPositions.length > 0
    ? filters[filterPositions[0]]
    : undefined;
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
