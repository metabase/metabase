import * as Lib from "metabase-lib";

import type { ListItem, ListSection } from "./types";

export function getBreakoutListItem(
  query: Lib.Query,
  stageIndex: number,
  breakout: Lib.BreakoutClause,
): ListItem | undefined {
  const column = Lib.breakoutColumn(query, stageIndex, breakout);
  if (column == null) {
    return;
  }

  const columnWithoutBucketing = Lib.withBinning(
    Lib.withTemporalBucket(column, null),
    null,
  );
  const columnInfo = Lib.displayInfo(query, stageIndex, columnWithoutBucketing);
  return { ...columnInfo, column, breakout };
}

function getColumnListItems(
  query: Lib.Query,
  stageIndex: number,
  breakouts: Lib.BreakoutClause[],
  column: Lib.ColumnMetadata,
): ListItem[] {
  const columnInfo = Lib.displayInfo(query, stageIndex, column);
  const { breakoutPositions = [] } = columnInfo;
  if (breakoutPositions.length === 0) {
    return [{ ...columnInfo, column }];
  }

  return breakoutPositions.reduce((items: ListItem[], index) => {
    const breakout = breakouts[index];
    const column = Lib.breakoutColumn(query, stageIndex, breakout);
    if (column != null) {
      items.push({
        ...columnInfo,
        column,
        breakout,
      });
    }
    return items;
  }, []);
}

export function getColumnSections(
  query: Lib.Query,
  stageIndex: number,
  columns: Lib.ColumnMetadata[],
  searchQuery: string,
): ListSection[] {
  const breakouts = Lib.breakouts(query, stageIndex);
  const formattedSearchQuery = searchQuery.trim().toLowerCase();

  const filteredColumns =
    formattedSearchQuery.length > 0
      ? columns.filter((column) => {
          const { displayName } = Lib.displayInfo(query, stageIndex, column);
          return displayName.toLowerCase().includes(formattedSearchQuery);
        })
      : columns;

  return Lib.groupColumns(filteredColumns).map((group) => {
    const groupInfo = Lib.displayInfo(query, stageIndex, group);

    const items = Lib.getColumnsFromColumnGroup(group).flatMap((column) =>
      getColumnListItems(query, stageIndex, breakouts, column),
    );

    return {
      name: groupInfo.displayName,
      items,
    };
  });
}

export function isPinnedColumn(
  query: Lib.Query,
  stageIndex: number,
  column: Lib.ColumnMetadata,
  pinnedItemCount: number,
): boolean {
  const { breakoutPositions = [] } = Lib.displayInfo(query, stageIndex, column);
  return (
    breakoutPositions.length > 0 &&
    breakoutPositions.every((breakoutIndex) => breakoutIndex < pinnedItemCount)
  );
}
