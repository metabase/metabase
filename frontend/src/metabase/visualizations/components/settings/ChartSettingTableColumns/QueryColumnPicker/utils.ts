import { t } from "ttag";

import * as Lib from "metabase-lib";

import type { ColumnGroupItem, ColumnItem } from "./types";

function getColumns(query: Lib.Query, stageIndex: number) {
  const aggregations = Lib.aggregations(query, stageIndex);
  const breakouts = Lib.breakouts(query, stageIndex);
  return aggregations.length > 0 || breakouts.length > 0
    ? Lib.returnedColumns(query, stageIndex)
    : Lib.visibleColumns(query, stageIndex);
}

function getGroupsWithColumns(
  query: Lib.Query,
  stageIndex: number,
  columns: Lib.ColumnMetadata[],
) {
  const groups = Lib.groupColumns(columns);

  return groups.map(group => {
    const groupInfo = Lib.displayInfo(query, stageIndex, group);
    const columnItems = Lib.getColumnsFromColumnGroup(group).map(column => {
      const columnInfo = Lib.displayInfo(query, stageIndex, column);

      return {
        column,
        displayName: columnInfo.displayName,
        isSelected: columnInfo.selected ?? false,
        isDisabled: columnInfo.isAggregation || columnInfo.isBreakout,
      };
    });

    return {
      columnItems,
      displayName:
        groupInfo.fkReferenceName || groupInfo.displayName || t`Question`,
      isSelected: columnItems.every(columnItem => columnItem.isSelected),
      isDisabled: columnItems.some(columnItem => columnItem.isDisabled),
    };
  });
}

function addUniqueGroupNames(groupItems: ColumnGroupItem[]) {
  const groupNames = new Map<string, number>();

  return groupItems.map(groupItem => {
    const usageCount = groupNames.get(groupItem.displayName) ?? 0;
    const newUsageCount = usageCount + 1;
    groupNames.set(groupItem.displayName, newUsageCount);

    const displayName =
      newUsageCount === 1
        ? groupItem.displayName
        : t`${groupItem.displayName} ${newUsageCount}`;

    return { ...groupItem, displayName };
  });
}

export function getColumnGroupItems(
  query: Lib.Query,
  stageIndex: number,
): ColumnGroupItem[] {
  const columns = getColumns(query, stageIndex);
  const groupItems = getGroupsWithColumns(query, stageIndex, columns);
  return addUniqueGroupNames(groupItems);
}

export function searchColumnGroupItems(
  groupItems: ColumnGroupItem[],
  searchValue: string,
): ColumnGroupItem[] {
  const searchString = searchValue.trim().toLowerCase();
  if (searchString.length === 0) {
    return groupItems;
  }

  return groupItems
    .map(groupItem => ({
      ...groupItem,
      columnItems: groupItem.columnItems.filter(columnItem =>
        columnItem.displayName.toLowerCase().includes(searchString),
      ),
    }))
    .filter(groupItem => groupItem.columnItems.length > 0);
}

export function toggleColumnInQuery(
  query: Lib.Query,
  stageIndex: number,
  { column, isSelected }: ColumnItem,
) {
  return isSelected
    ? Lib.removeField(query, stageIndex, column)
    : Lib.addField(query, stageIndex, column);
}

export function toggleColumnGroupInQuery(
  query: Lib.Query,
  stageIndex: number,
  groupItem: ColumnGroupItem,
) {
  return groupItem.columnItems.reduce((query, columnItem) => {
    if (groupItem.isSelected) {
      return columnItem.isSelected
        ? Lib.removeField(query, stageIndex, columnItem.column)
        : query;
    } else {
      return columnItem.isSelected
        ? query
        : Lib.addField(query, stageIndex, columnItem.column);
    }
  }, query);
}
