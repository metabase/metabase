import { useMemo } from "react";

import type { ColumnItem } from "metabase/querying/utils/filters";
import type * as Lib from "metabase-lib";

import { TabPanelColumnItem } from "./TabPanelColumnItem";
import { sortColumns } from "./sorting";

export interface TabPanelColumnItemListProps {
  query: Lib.Query;
  columnItems: ColumnItem[];
  isSearching: boolean;
  onChange: (newQuery: Lib.Query) => void;
  onInput: () => void;
}

export const TabPanelColumnItemList = ({
  query,
  columnItems,
  isSearching,
  onChange,
  onInput,
}: TabPanelColumnItemListProps) => {
  const sortedItems = useMemo(() => sortColumns(columnItems), [columnItems]);

  return (
    <>
      {sortedItems.map((columnItem, columnIndex) => (
        <TabPanelColumnItem
          key={columnIndex}
          query={query}
          columnItem={columnItem}
          isSearching={isSearching}
          onChange={onChange}
          onInput={onInput}
        />
      ))}
    </>
  );
};
