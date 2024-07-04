import { useMemo, useState } from "react";

import { DelayGroup } from "metabase/ui";
import type * as Lib from "metabase-lib";

import { TabPanelFilterItem } from "../TabPanelItem";
import type { ColumnItem } from "../types";

import { findColumnFilters, findVisibleFilters } from "./columns";

export interface TabPanelColumnItemProps {
  query: Lib.Query;
  columnItem: ColumnItem;
  isSearching: boolean;
  onChange: (newQuery: Lib.Query) => void;
  onInput: () => void;
}

export function TabPanelColumnItem({
  query,
  columnItem,
  isSearching,
  onChange,
  onInput,
}: TabPanelColumnItemProps) {
  const { column, stageIndex } = columnItem;
  const currentFilters = useMemo(
    () => findColumnFilters(query, stageIndex, column),
    [query, stageIndex, column],
  );
  const [initialFilterCount] = useState(currentFilters.length);
  const visibleFilters = findVisibleFilters(currentFilters, initialFilterCount);

  return (
    <DelayGroup>
      {visibleFilters.map((filter, filterIndex) => (
        <TabPanelFilterItem
          key={filterIndex}
          query={query}
          columnItem={columnItem}
          filter={filter}
          isSearching={isSearching}
          onChange={onChange}
          onInput={onInput}
        />
      ))}
    </DelayGroup>
  );
}
