import { useCallback, useMemo, useState } from "react";
import _ from "underscore";
import { t } from "ttag";
import Input from "metabase/core/components/Input";
import { getColumnGroupName } from "metabase/common/utils/column-groups";
import { useDebouncedValue } from "metabase/hooks/use-debounced-value";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/lib/constants";
import * as Lib from "metabase-lib";
import { BreakoutColumnListItem } from "./BreakoutColumnListItem";
import { ColumnGroupName, SearchContainer } from "./BreakoutColumnList.styled";

const STAGE_INDEX = -1;

export interface BreakoutColumnListProps {
  query: Lib.Query;
  onAddBreakout: (column: Lib.ColumnMetadata) => void;
  onUpdateBreakout: (
    breakout: Lib.BreakoutClause,
    nextColumn: Lib.ColumnMetadata,
  ) => void;
  onRemoveBreakout: (column: Lib.ColumnMetadata) => void;
  onReplaceBreakout: (column: Lib.ColumnMetadata) => void;
}

export function BreakoutColumnList({
  query,
  onAddBreakout,
  onUpdateBreakout,
  onRemoveBreakout,
  onReplaceBreakout,
}: BreakoutColumnListProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchQuery = useDebouncedValue(
    searchQuery,
    SEARCH_DEBOUNCE_DURATION,
  );
  const isSearching = searchQuery.trim().length > 0;

  const breakouts = Lib.breakouts(query, STAGE_INDEX);
  const [pinnedBreakouts, setPinnedBreakouts] = useState(breakouts);

  const allColumns = useMemo(
    () => Lib.breakoutableColumns(query, STAGE_INDEX),
    [query],
  );

  const [pinnedColumns, unpinnedColumns] = useMemo(
    () =>
      _.partition(allColumns, column =>
        isPinnedColumn(query, pinnedBreakouts, column),
      ),
    [query, pinnedBreakouts, allColumns],
  );

  const pinnedItems = useMemo(
    () =>
      pinnedColumns.map(column => getColumnListItem(query, breakouts, column)),
    [query, breakouts, pinnedColumns],
  );

  const sections = useMemo(
    () =>
      getColumnSections(
        query,
        isSearching ? allColumns : unpinnedColumns,
        debouncedSearchQuery,
      ),
    [query, allColumns, unpinnedColumns, isSearching, debouncedSearchQuery],
  );

  const handleRemovePinnedBreakout = useCallback(
    (column: Lib.ColumnMetadata) => {
      const { breakoutPosition } = Lib.displayInfo(query, STAGE_INDEX, column);
      const isPinned =
        breakoutPosition != null && breakoutPosition < pinnedBreakouts.length;

      if (isPinned) {
        const breakout = pinnedBreakouts[breakoutPosition];
        setPinnedBreakouts(breakouts => breakouts.filter(b => b !== breakout));
      }

      onRemoveBreakout(column);
    },
    [query, pinnedBreakouts, onRemoveBreakout],
  );

  const handleReplaceBreakout = useCallback(
    (column: Lib.ColumnMetadata) => {
      onReplaceBreakout(column);
      setPinnedBreakouts([]);
    },
    [onReplaceBreakout],
  );

  const handleChangeSearchQuery = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
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
        <ul data-testid="pinned-dimensions">
          {pinnedItems.map(item => (
            <BreakoutColumnListItem
              key={item.longDisplayName}
              query={query}
              item={item}
              breakout={item.breakout}
              isPinned
              onAddColumn={onAddBreakout}
              onUpdateColumn={column => {
                if (item.breakout) {
                  onUpdateBreakout(item.breakout, column);
                } else {
                  onAddBreakout(column);
                }
              }}
              onRemoveColumn={handleRemovePinnedBreakout}
            />
          ))}
        </ul>
      )}
      <ul data-testid="unpinned-dimensions">
        {sections.map(section => (
          <li key={section.name}>
            <ColumnGroupName>{section.name}</ColumnGroupName>
            <ul>
              {section.items.map(item => (
                <BreakoutColumnListItem
                  key={item.longDisplayName}
                  query={query}
                  item={item}
                  breakout={item.breakout}
                  onAddColumn={onAddBreakout}
                  onUpdateColumn={column => {
                    if (item.breakout) {
                      onUpdateBreakout(item.breakout, column);
                    } else {
                      onAddBreakout(column);
                    }
                  }}
                  onRemoveColumn={onRemoveBreakout}
                  onReplaceColumns={handleReplaceBreakout}
                />
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </>
  );
}

function getColumnListItem(
  query: Lib.Query,
  breakouts: Lib.BreakoutClause[],
  column: Lib.ColumnMetadata,
) {
  const displayInfo = Lib.displayInfo(query, STAGE_INDEX, column);
  const breakout =
    displayInfo.breakoutPosition != null
      ? breakouts[displayInfo.breakoutPosition]
      : undefined;
  return {
    ...displayInfo,
    column,
    breakout,
  };
}

function getColumnSections(
  query: Lib.Query,
  columns: Lib.ColumnMetadata[],
  searchQuery: string,
) {
  const breakouts = Lib.breakouts(query, STAGE_INDEX);
  const formattedSearchQuery = searchQuery.trim().toLowerCase();

  const filteredColumns =
    formattedSearchQuery.length > 0
      ? columns.filter(column => {
          const { displayName } = Lib.displayInfo(query, STAGE_INDEX, column);
          return displayName.toLowerCase().includes(formattedSearchQuery);
        })
      : columns;

  return Lib.groupColumns(filteredColumns).map(group => {
    const groupInfo = Lib.displayInfo(query, STAGE_INDEX, group);

    const items = Lib.getColumnsFromColumnGroup(group).map(column =>
      getColumnListItem(query, breakouts, column),
    );

    return {
      name: getColumnGroupName(groupInfo),
      items,
    };
  });
}

function isPinnedColumn(
  query: Lib.Query,
  pinnedBreakouts: Lib.BreakoutClause[],
  column: Lib.ColumnMetadata,
) {
  const { breakoutPosition } = Lib.displayInfo(query, STAGE_INDEX, column);
  const maxPinnedBreakoutIndex = pinnedBreakouts.length - 1;
  return breakoutPosition != null && breakoutPosition <= maxPinnedBreakoutIndex;
}
