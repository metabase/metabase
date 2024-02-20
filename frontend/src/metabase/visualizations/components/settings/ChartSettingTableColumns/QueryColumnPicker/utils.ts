import * as Lib from "metabase-lib";
import type { ColumnGroupItem, ColumnItem } from "./types";

export function getColumnGroupItems(
  query: Lib.Query,
  stageIndex: number,
): ColumnGroupItem[] {
  const aggregations = Lib.aggregations(query, stageIndex);
  const breakouts = Lib.breakouts(query, stageIndex);
  const columns =
    aggregations.length > 0 || breakouts.length > 0
      ? Lib.returnedColumns(query, stageIndex)
      : Lib.visibleColumns(query, stageIndex);
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
      displayName: groupInfo.displayName,
      isSelected: columnItems.every(columnItem => columnItem.isSelected),
      isDisabled: columnItems.some(columnItem => columnItem.isDisabled),
    };
  });
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
  { columnItems, isSelected }: ColumnGroupItem,
) {
  return columnItems.reduce(
    (query, { column }) =>
      isSelected
        ? Lib.removeField(query, stageIndex, column)
        : Lib.addField(query, stageIndex, column),
    query,
  );
}
