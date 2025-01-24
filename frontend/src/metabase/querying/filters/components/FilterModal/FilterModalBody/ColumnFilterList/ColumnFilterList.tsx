import { useMemo } from "react";

import type { ColumnItem } from "metabase/querying/filters/types";

import { ColumnFilterGroup } from "../ColumnFilterGroup";

import { sortColumns } from "./utils";

export interface ColumnFilterListProps {
  columnItems: ColumnItem[];
}

export const ColumnFilterList = ({ columnItems }: ColumnFilterListProps) => {
  const sortedItems = useMemo(() => sortColumns(columnItems), [columnItems]);

  return (
    <>
      {sortedItems.map((columnItem, columnIndex) => (
        <ColumnFilterGroup key={columnIndex} columnItem={columnItem} />
      ))}
    </>
  );
};
