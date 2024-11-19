import { type ChangeEvent, useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import Input from "metabase/core/components/Input";
import { useDebouncedValue } from "metabase/hooks/use-debounced-value";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/lib/constants";
import type { UpdateQueryHookProps } from "metabase/query_builder/hooks/types";
import { useBreakoutQueryHandlers } from "metabase/query_builder/hooks/use-breakout-query-handlers";
import { DelayGroup } from "metabase/ui";
import * as Lib from "metabase-lib";

import { ColumnGroupName, SearchContainer } from "./BreakoutColumnList.styled";
import { BreakoutColumnListItem } from "./BreakoutColumnListItem";

export type BreakoutColumnListProps = UpdateQueryHookProps;

export function BreakoutColumnList({
  query,
  onQueryChange,
  stageIndex = -1,
}: BreakoutColumnListProps) {
  const {
    onAddBreakout,
    onUpdateBreakout,
    onRemoveBreakout,
    onReplaceBreakouts,
  } = useBreakoutQueryHandlers({ query, onQueryChange, stageIndex });

  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchQuery = useDebouncedValue(
    searchQuery,
    SEARCH_DEBOUNCE_DURATION,
  );
  const isSearching = searchQuery.trim().length > 0;

  const breakouts = Lib.breakouts(query, stageIndex);
  const [pinnedItemCount, setPinnedItemCount] = useState(breakouts.length);

  const pinnedItems = useMemo(
    () =>
      breakouts
        .slice(0, pinnedItemCount)
        .map(breakout => getBreakoutListItem(query, stageIndex, breakout)),
    [query, stageIndex, breakouts, pinnedItemCount],
  );

  const allColumns = useMemo(
    () => Lib.breakoutableColumns(query, stageIndex),
    [query, stageIndex],
  );

  const unpinnedColumns = useMemo(
    () =>
      allColumns.filter(
        column => !isPinnedColumn(query, stageIndex, column, pinnedItemCount),
      ),
    [query, stageIndex, allColumns, pinnedItemCount],
  );

  const sections = useMemo(
    () =>
      getColumnSections(
        query,
        stageIndex,
        isSearching ? allColumns : unpinnedColumns,
        debouncedSearchQuery,
      ),
    [
      query,
      stageIndex,
      allColumns,
      unpinnedColumns,
      isSearching,
      debouncedSearchQuery,
    ],
  );

  const handleRemovePinnedBreakout = useCallback(
    (breakout: Lib.BreakoutClause) => {
      setPinnedItemCount(pinnedItemCount - 1);
      onRemoveBreakout(breakout);
    },
    [pinnedItemCount, onRemoveBreakout],
  );

  const handleReplaceBreakouts = useCallback(
    (column: Lib.ColumnMetadata) => {
      onReplaceBreakouts(column);
      setPinnedItemCount(0);
    },
    [onReplaceBreakouts],
  );

  const handleChangeSearchQuery = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setSearchQuery(event.target.value);
    },
    [],
  );

  const handleResetSearch = useCallback(() => setSearchQuery(""), []);

  return (
    <>
      <SearchContainer>
        <Input
          fullWidth
          placeholder={t`Find...`}
          value={searchQuery}
          leftIcon="search"
          onResetClick={handleResetSearch}
          onChange={handleChangeSearchQuery}
        />
      </SearchContainer>
      {!isSearching && (
        <DelayGroup>
          <ul data-testid="pinned-dimensions">
            {pinnedItems.map((item, itemIndex) => (
              <BreakoutColumnListItem
                key={itemIndex}
                query={query}
                stageIndex={stageIndex}
                item={item}
                breakout={item.breakout}
                isPinned
                onAddBreakout={onAddBreakout}
                onUpdateBreakout={onUpdateBreakout}
                onRemoveBreakout={handleRemovePinnedBreakout}
              />
            ))}
          </ul>
        </DelayGroup>
      )}
      <DelayGroup>
        <ul data-testid="unpinned-dimensions">
          {sections.map(section => (
            <li key={section.name}>
              <ColumnGroupName>{section.name}</ColumnGroupName>
              <ul>
                {section.items.map((item, itemIndex) => (
                  <BreakoutColumnListItem
                    key={itemIndex}
                    query={query}
                    stageIndex={stageIndex}
                    item={item}
                    breakout={item.breakout}
                    onAddBreakout={onAddBreakout}
                    onUpdateBreakout={onUpdateBreakout}
                    onRemoveBreakout={onRemoveBreakout}
                    onReplaceBreakouts={handleReplaceBreakouts}
                  />
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </DelayGroup>
    </>
  );
}

type ListItem = Lib.ColumnDisplayInfo & {
  column: Lib.ColumnMetadata;
  breakout?: Lib.BreakoutClause;
};

type ListSection = {
  name: string;
  items: ListItem[];
};

function getBreakoutListItem(
  query: Lib.Query,
  stageIndex: number,
  breakout: Lib.BreakoutClause,
): ListItem {
  const column = Lib.breakoutColumn(query, stageIndex, breakout);
  const columnInfo = Lib.displayInfo(query, stageIndex, column);
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

  return breakoutPositions.map(index => {
    const breakout = breakouts[index];
    return {
      ...columnInfo,
      column: Lib.breakoutColumn(query, stageIndex, breakout),
      breakout,
    };
  });
}

function getColumnSections(
  query: Lib.Query,
  stageIndex: number,
  columns: Lib.ColumnMetadata[],
  searchQuery: string,
): ListSection[] {
  const breakouts = Lib.breakouts(query, stageIndex);
  const formattedSearchQuery = searchQuery.trim().toLowerCase();

  const filteredColumns =
    formattedSearchQuery.length > 0
      ? columns.filter(column => {
          const { displayName } = Lib.displayInfo(query, stageIndex, column);
          return displayName.toLowerCase().includes(formattedSearchQuery);
        })
      : columns;

  return Lib.groupColumns(filteredColumns).map(group => {
    const groupInfo = Lib.displayInfo(query, stageIndex, group);

    const items = Lib.getColumnsFromColumnGroup(group).flatMap(column =>
      getColumnListItems(query, stageIndex, breakouts, column),
    );

    return {
      name: groupInfo.displayName,
      items,
    };
  });
}

function isPinnedColumn(
  query: Lib.Query,
  stageIndex: number,
  column: Lib.ColumnMetadata,
  pinnedItemCount: number,
): boolean {
  const { breakoutPositions = [] } = Lib.displayInfo(query, stageIndex, column);
  return (
    breakoutPositions.length > 0 &&
    breakoutPositions.every(breakoutIndex => breakoutIndex < pinnedItemCount)
  );
}
