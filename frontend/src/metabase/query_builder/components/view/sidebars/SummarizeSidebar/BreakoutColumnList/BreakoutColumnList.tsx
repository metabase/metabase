import { useState } from "react";
import _ from "underscore";
import { t } from "ttag";
import Input from "metabase/core/components/Input";
import { singularize } from "metabase/lib/formatting";
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
  const isSearching = debouncedSearchQuery.trim().length > 0;

  const breakouts = Lib.breakouts(query, STAGE_INDEX);
  const [pinnedBreakouts, setPinnedBreakouts] = useState(breakouts);

  const allColumns = Lib.breakoutableColumns(query, STAGE_INDEX);

  const [pinnedColumns, unpinnedColumns] = _.partition(allColumns, column =>
    isPinnedColumn(query, pinnedBreakouts, column),
  );

  const pinnedItems = pinnedColumns.map(column =>
    getColumnListItem(query, column),
  );

  const sections = getColumnSections(
    query,
    isSearching ? allColumns : unpinnedColumns,
    searchQuery,
  );

  const handleRemovePinnedBreakout = (column: Lib.ColumnMetadata) => {
    const { breakoutPosition } = Lib.displayInfo(query, STAGE_INDEX, column);
    const isPinned =
      breakoutPosition != null && breakoutPosition < pinnedBreakouts.length;

    if (isPinned) {
      const breakout = pinnedBreakouts[breakoutPosition];
      setPinnedBreakouts(breakouts => breakouts.filter(b => b !== breakout));
    }

    onRemoveBreakout(column);
  };

  const handleReplaceBreakout = (column: Lib.ColumnMetadata) => {
    onReplaceBreakout(column);
    setPinnedBreakouts([]);
  };

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
            const breakout =
              item.breakoutPosition != null
                ? breakouts[item.breakoutPosition]
                : undefined;
            return (
              <BreakoutColumnListItem
                key={item.longDisplayName}
                query={query}
                item={item}
                breakout={breakout}
                isPinned
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
              {section.items.map(item => {
                const breakout =
                  item.breakoutPosition != null
                    ? breakouts[item.breakoutPosition]
                    : undefined;
                return (
                  <BreakoutColumnListItem
                    key={item.longDisplayName}
                    query={query}
                    item={item}
                    breakout={breakout}
                    onAddColumn={onAddBreakout}
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

function getColumnListItem(query: Lib.Query, column: Lib.ColumnMetadata) {
  return {
    ...Lib.displayInfo(query, STAGE_INDEX, column),
    column,
  };
}

function getColumnSections(
  query: Lib.Query,
  columns: Lib.ColumnMetadata[],
  searchQuery: string,
) {
  const formattedQuery = searchQuery.trim().toLowerCase();

  const filteredColumns =
    formattedQuery.length > 0
      ? columns.filter(column => {
          const { displayName } = Lib.displayInfo(query, STAGE_INDEX, column);
          return displayName.toLowerCase().includes(formattedQuery);
        })
      : columns;

  return Lib.groupColumns(filteredColumns).map(group => {
    const groupInfo = Lib.displayInfo(query, STAGE_INDEX, group);

    const items = Lib.getColumnsFromColumnGroup(group).map(column =>
      getColumnListItem(query, column),
    );

    return {
      name: getGroupName(groupInfo),
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
  if (typeof breakoutPosition === "number") {
    const breakout = Lib.breakouts(query, STAGE_INDEX)[breakoutPosition];
    return pinnedBreakouts.includes(breakout);
  }
  return false;
}
