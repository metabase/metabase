import { useMemo } from "react";

import type * as Lib from "metabase-lib";

import type { ColumnItem } from "../types";

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
