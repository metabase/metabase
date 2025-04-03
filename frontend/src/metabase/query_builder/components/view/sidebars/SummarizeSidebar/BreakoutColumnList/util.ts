import * as Lib from "metabase-lib";

import type { ListItem, ListSection } from "./types";
import {
  TCFunc,
  useTranslateContent2,
} from "metabase/i18n/components/ContentTranslationContext";

export function getBreakoutListItem(
  query: Lib.Query,
  stageIndex: number,
  breakout: Lib.BreakoutClause,
  tc?: TCFunc,
): ListItem {
  const column = Lib.breakoutColumn(query, stageIndex, breakout);
  const columnInfo = Lib.displayInfo(query, stageIndex, column, tc);
  return { ...columnInfo, column, breakout };
}

function getColumnListItems(
  query: Lib.Query,
  stageIndex: number,
  breakouts: Lib.BreakoutClause[],
  column: Lib.ColumnMetadata,
  tc?: TCFunc,
): ListItem[] {
  const columnInfo = Lib.displayInfo(query, stageIndex, column, tc);
  console.log("@m91xhouo", "columnInfo", columnInfo);

  const { breakoutPositions = [] } = columnInfo;
  if (breakoutPositions.length === 0) {
    return [{ ...columnInfo, column }];
  }

  return breakoutPositions.map((index) => {
    const breakout = breakouts[index];
    return {
      ...columnInfo,
      column: Lib.breakoutColumn(query, stageIndex, breakout),
      breakout,
    };
  });
}

export function getColumnSections(
  query: Lib.Query,
  stageIndex: number,
  columns: Lib.ColumnMetadata[],
  searchQuery: string,
  tc: TCFunc,
): ListSection[] {
  const breakouts = Lib.breakouts(query, stageIndex);
  const formattedSearchQuery = searchQuery.trim().toLowerCase();

  const filteredColumns =
    formattedSearchQuery.length > 0
      ? columns.filter((column) => {
          const { displayName } = Lib.displayInfo(
            query,
            stageIndex,
            column,
            tc,
          );
          return displayName.toLowerCase().includes(formattedSearchQuery);
        })
      : columns;

  return Lib.groupColumns(filteredColumns).map((group) => {
    const groupInfo = Lib.displayInfo(query, stageIndex, group);

    const items = Lib.getColumnsFromColumnGroup(group, tc)
      .flatMap((column) =>
        getColumnListItems(query, stageIndex, breakouts, column, tc),
      )
      .toSorted((a, b) => a.displayName.localeCompare(b.displayName));

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
