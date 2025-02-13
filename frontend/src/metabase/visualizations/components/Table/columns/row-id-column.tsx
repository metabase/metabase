import type { ColumnDef } from "@tanstack/react-table";

import { RowIdCell } from "metabase/visualizations/components/Table/cell/RowIdCell";
import { RowIdHeaderCell } from "metabase/visualizations/components/Table/cell/RowIdHeaderCell";

import { ROW_ID_COLUMN_ID } from "../constants";
import type { RowIdVariant } from "../types";

export const getRowIdColumnSize = (variant: RowIdVariant) =>
  variant === "expandButton" ? 36 : 42;

export const getRowIdColumn = <TRow, TValue>(
  variant: RowIdVariant,
): ColumnDef<TRow, TValue> => {
  const shouldShowIndex = ["indexOnly", "indexExpand"].includes(variant);
  return {
    accessorFn: (_row, index) => index as TValue,
    id: ROW_ID_COLUMN_ID,
    size: getRowIdColumnSize(variant),
    enableSorting: false,
    enableResizing: false,
    cell: ({ row }) => {
      const value = shouldShowIndex ? row.index + 1 : null;
      return <RowIdCell value={value} />;
    },
    header: () => {
      return <RowIdHeaderCell name={shouldShowIndex ? "#" : ""} />;
    },
  };
};
