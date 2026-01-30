import { type ChangeEvent, useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import { Input } from "metabase/common/components/Input";
import { useDebouncedValue } from "metabase/common/hooks/use-debounced-value";
import { useTranslateContent } from "metabase/i18n/hooks";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/lib/constants";
import { isNotNull } from "metabase/lib/types";
import {
  type UpdateQueryHookProps,
  useBreakoutQueryHandlers,
} from "metabase/query_builder/hooks";
import { Box, DelayGroup } from "metabase/ui";
import * as Lib from "metabase-lib";

import BreakoutColumnListS from "./BreakoutColumnList.module.css";
import { BreakoutColumnListItem } from "./BreakoutColumnListItem";
import { getBreakoutListItem, getColumnSections, isPinnedColumn } from "./util";

export type BreakoutColumnListProps = UpdateQueryHookProps;

export function BreakoutColumnList({
  query,
  onQueryChange,
  stageIndex = -1,
}: BreakoutColumnListProps) {
  const tc = useTranslateContent();
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
        .map((breakout) => getBreakoutListItem(query, stageIndex, breakout))
        .filter(isNotNull),
    [query, stageIndex, breakouts, pinnedItemCount],
  );

  const allColumns = useMemo(
    () => Lib.breakoutableColumns(query, stageIndex),
    [query, stageIndex],
  );

  const unpinnedColumns = useMemo(
    () =>
      allColumns.filter(
        (column) => !isPinnedColumn(query, stageIndex, column, pinnedItemCount),
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
      <Box mb="md">
        <Input
          fullWidth
          placeholder={t`Find...`}
          value={searchQuery}
          leftIcon="search"
          onResetClick={handleResetSearch}
          onChange={handleChangeSearchQuery}
        />
      </Box>
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
          {sections.map((section) => (
            <li key={section.name}>
              <Box className={BreakoutColumnListS.ColumnGroupName}>
                {tc(section.name)}
              </Box>
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
