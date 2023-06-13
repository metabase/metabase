import { useCallback, useMemo, useState } from "react";
import _ from "underscore";
import { t } from "ttag";
import Input from "metabase/core/components/Input";
import { singularize } from "metabase/lib/formatting";
import { useDebouncedValue } from "metabase/hooks/use-debounced-value";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/lib/constants";
import * as Lib from "metabase-lib";
import { BreakoutColumnListItem } from "./BreakoutColumnListItem";
import { ColumnGroupName, SearchContainer } from "./BreakoutColumnList.styled";

export interface BreakoutColumnListProps {
  query: Lib.Query;
  stageIndex: number;
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
  stageIndex,
  onAddBreakout,
  onUpdateBreakout,
  onRemoveBreakout,
  onReplaceBreakout,
}: BreakoutColumnListProps) {
  const breakouts = useMemo(
    () => Lib.breakouts(query, stageIndex),
    [query, stageIndex],
  );

  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchQuery = useDebouncedValue(
    searchQuery,
    SEARCH_DEBOUNCE_DURATION,
  );
  const isSearching = debouncedSearchQuery.trim().length > 0;

  const [pinnedBreakouts, setPinnedBreakouts] = useState(breakouts);

  const allColumns = useMemo(
    () => Lib.breakoutableColumns(query, stageIndex),
    [query, stageIndex],
  );

  const [pinnedColumns, unpinnedColumns] = useMemo(() => {
    return _.partition(allColumns, column =>
      isPinnedColumn(query, stageIndex, pinnedBreakouts, column),
    );
  }, [query, stageIndex, allColumns, pinnedBreakouts]);

  const pinnedItems = useMemo(
    () =>
      pinnedColumns.map(column => getColumnListItem(query, stageIndex, column)),
    [query, stageIndex, pinnedColumns],
  );

  const sections = useMemo(() => {
    const columnGroups = Lib.groupColumns(
      isSearching ? allColumns : unpinnedColumns,
    );

    return columnGroups.map(group => {
      const groupInfo = Lib.displayInfo(query, stageIndex, group);

      const items = Lib.getColumnsFromColumnGroup(group).map(column =>
        getColumnListItem(query, stageIndex, column),
      );

      return {
        name: getGroupName(groupInfo),
        items,
      };
    });
  }, [query, stageIndex, allColumns, unpinnedColumns, isSearching]);

  const handleRemovePinnedBreakout = useCallback(
    (column: Lib.ColumnMetadata) => {
      const { breakoutPosition } = Lib.displayInfo(query, stageIndex, column);
      const isPinned =
        breakoutPosition != null && breakoutPosition < pinnedBreakouts.length;

      if (isPinned) {
        const breakout = pinnedBreakouts[breakoutPosition];
        setPinnedBreakouts(breakouts => breakouts.filter(b => b !== breakout));
      }

      onRemoveBreakout(column);
    },
    [query, stageIndex, pinnedBreakouts, onRemoveBreakout],
  );

  const handleReplaceBreakout = useCallback(
    (column: Lib.ColumnMetadata) => {
      onReplaceBreakout(column);
      setPinnedBreakouts([]);
    },
    [onReplaceBreakout],
  );

  return (
    <>
      <SearchContainer>
        <Input
          fullWidth
          placeholder={t`Find...`}
          value={searchQuery}
          leftIcon="search"
          onResetClick={() => setSearchQuery("")}
          onChange={event => setSearchQuery(event.target.value)}
        />
      </SearchContainer>
      {!isSearching && (
        <ul data-testid="pinned-dimensions">
          {pinnedItems.map(item => {
            const breakout = item.breakoutPosition
              ? breakouts[item.breakoutPosition]
              : undefined;
            return (
              <BreakoutColumnListItem
                key={item.longDisplayName}
                query={query}
                stageIndex={stageIndex}
                item={item}
                clause={breakout}
                onAddColumn={onAddBreakout}
                onUpdateColumn={column => {
                  if (breakout) {
                    onUpdateBreakout(breakout, column);
                  } else {
                    onAddBreakout(column);
                  }
                }}
                onRemoveColumn={handleRemovePinnedBreakout}
              />
            );
          })}
        </ul>
      )}
      <ul data-testid="unpinned-dimensions">
        {sections.map(section => (
          <li key={section.name}>
            <ColumnGroupName>{section.name}</ColumnGroupName>
            <ul>
              {section.items
                .filter(item => maybeFilterColumnItem(item, searchQuery))
                .map(item => {
                  const breakout = item.breakoutPosition
                    ? breakouts[item.breakoutPosition]
                    : undefined;
                  return (
                    <BreakoutColumnListItem
                      key={item.longDisplayName}
                      query={query}
                      stageIndex={stageIndex}
                      item={item}
                      clause={breakout}
                      onAddColumn={column => onAddBreakout(column)}
                      onUpdateColumn={column => {
                        if (breakout) {
                          onUpdateBreakout(breakout, column);
                        } else {
                          onAddBreakout(column);
                        }
                      }}
                      onRemoveColumn={onRemoveBreakout}
                      onReplaceColumns={handleReplaceBreakout}
                    />
                  );
                })}
            </ul>
          </li>
        ))}
      </ul>
    </>
  );
}

function getGroupName(groupInfo: Lib.ColumnDisplayInfo | Lib.TableDisplayInfo) {
  const columnInfo = groupInfo as Lib.ColumnDisplayInfo;
  const tableInfo = groupInfo as Lib.TableDisplayInfo;
  return columnInfo.fkReferenceName || singularize(tableInfo.displayName);
}

function getColumnListItem(
  query: Lib.Query,
  stageIndex: number,
  column: Lib.ColumnMetadata,
) {
  return {
    ...Lib.displayInfo(query, stageIndex, column),
    column,
  };
}

function isPinnedColumn(
  query: Lib.Query,
  stageIndex: number,
  pinnedBreakouts: Lib.BreakoutClause[],
  column: Lib.ColumnMetadata,
) {
  const { breakoutPosition } = Lib.displayInfo(query, stageIndex, column);
  if (typeof breakoutPosition === "number") {
    const breakout = Lib.breakouts(query, stageIndex)[breakoutPosition];
    return pinnedBreakouts.includes(breakout);
  }
  return false;
}

function maybeFilterColumnItem(item: Lib.ColumnDisplayInfo, query?: string) {
  if (!query) {
    return true;
  }
  return item.displayName.toLowerCase().includes(query.trim().toLowerCase());
}
