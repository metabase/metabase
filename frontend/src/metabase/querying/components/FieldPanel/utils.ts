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

function getColumnItems(
  query: Lib.Query,
  stageIndex: number,
  group: Lib.ColumnGroup,
): ColumnItem[] {
  return Lib.getColumnsFromColumnGroup(group).map(column => {
    const columnInfo = Lib.displayInfo(query, stageIndex, column);
    return {
      column,
      displayName: columnInfo.displayName,
      isSelected: columnInfo.selected ?? false,
      isDisabled:
        columnInfo.isAggregation ||
        columnInfo.isBreakout ||
        columnInfo.isCalculated,
    };
  });
}

function getGroupsWithColumns(
  query: Lib.Query,
  stageIndex: number,
  columns: Lib.ColumnMetadata[],
): ColumnGroupItem[] {
  const groups = Lib.groupColumns(columns);
  return groups.map((group, groupIndex) => {
    const groupInfo = Lib.displayInfo(query, stageIndex, group);
    const columnItems = getColumnItems(query, stageIndex, group);

    return {
      columnItems,
      displayName:
        groupInfo.fkReferenceName || groupInfo.displayName || t`Question`,
      isSelected: columnItems.every(({ isSelected }) => isSelected),
      isDisabled: columnItems.every(({ isDisabled }) => isDisabled),
      isSourceGroup: groupIndex === 0,
    };
  });
}

function disableOnlySelectedQueryColumn(
  groupItems: ColumnGroupItem[],
): ColumnGroupItem[] {
  return groupItems.map(groupItem => {
    if (!groupItem.isSourceGroup) {
      return groupItem;
    }

    const isOnlySelectedColumn =
      groupItem.columnItems.filter(
        ({ isSelected, isDisabled }) => isSelected && !isDisabled,
      ).length === 1;

    return {
      ...groupItem,
      columnItems: groupItem.columnItems.map(columnItem => ({
        ...columnItem,
        isDisabled:
          columnItem.isDisabled ||
          (columnItem.isSelected && isOnlySelectedColumn),
      })),
      isDisabled:
        groupItem.isDisabled || (groupItem.isSelected && isOnlySelectedColumn),
    };
  });
}

function deduplicateGroupNames(
  groupItems: ColumnGroupItem[],
): ColumnGroupItem[] {
  const groupNames = new Map<string, number>();

  return groupItems.map(groupItem => {
    const usageCount = groupNames.get(groupItem.displayName) ?? 0;
    const newUsageCount = usageCount + 1;
    groupNames.set(groupItem.displayName, newUsageCount);

    const displayName =
      newUsageCount === 1
        ? groupItem.displayName
        : `${groupItem.displayName} ${newUsageCount}`;

    return { ...groupItem, displayName };
  });
}

export function getColumnGroupItems(
  query: Lib.Query,
  stageIndex: number,
): ColumnGroupItem[] {
  const columns = getColumns(query, stageIndex);
  const groupItems = getGroupsWithColumns(query, stageIndex, columns);
  return deduplicateGroupNames(disableOnlySelectedQueryColumn(groupItems));
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
  if (groupItem.isSelected) {
    // always leave 1 column in the first group selected to prevent creating queries without columns
    return groupItem.columnItems
      .filter(columnItem => columnItem.isSelected && !columnItem.isDisabled)
      .filter((_, columnIndex) => !groupItem.isSourceGroup || columnIndex !== 0)
      .reduce(
        (query, { column }) => Lib.removeField(query, stageIndex, column),
        query,
      );
  } else {
    return groupItem.columnItems
      .filter(columnItem => !columnItem.isSelected && !columnItem.isDisabled)
      .reduce(
        (query, { column }) => Lib.addField(query, stageIndex, column),
        query,
      );
  }
}
