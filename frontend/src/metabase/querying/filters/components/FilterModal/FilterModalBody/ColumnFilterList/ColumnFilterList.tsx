import { useMemo } from "react";

import type { ColumnItem } from "metabase/querying/filters/types";
import type * as Lib from "metabase-lib";

import { ColumnFilterGroup } from "../ColumnFilterGroup";

import { sortColumns } from "./utils";

export interface ColumnFilterListProps {
  query: Lib.Query;
  columnItems: ColumnItem[];
  onChange: (newQuery: Lib.Query) => void;
  onInput: () => void;
}

export const ColumnFilterList = ({
  query,
  columnItems,
  onChange,
  onInput,
}: ColumnFilterListProps) => {
  const sortedItems = useMemo(() => sortColumns(columnItems), [columnItems]);

  return (
    <>
      {sortedItems.map((columnItem, columnIndex) => (
        <ColumnFilterGroup
          key={columnIndex}
          query={query}
          columnItem={columnItem}
          onChange={onChange}
          onInput={onInput}
        />
      ))}
    </>
  );
};
