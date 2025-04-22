import type { ColumnDef } from "@tanstack/react-table";

import { RowIdCell } from "metabase/data-grid/components/RowIdCell/RowIdCell";
import { RowIdHeaderCell } from "metabase/data-grid/components/RowIdHeaderCell/RowIdHeaderCell";
import {
  MIN_COLUMN_WIDTH,
  ROW_ACTIONS_COLUMN_ID,
  ROW_ID_COLUMN_ID,
} from "metabase/data-grid/constants";
import {
  type RowActionsColumnConfig,
  RowIdColumnOptions,
  type RowIdVariant,
} from "metabase/data-grid/types";

// TODO: implement this
export const getActionsIdColumn = <TRow, TValue>({
  actions,
  renderCell,
}: RowActionsColumnConfig): ColumnDef<TRow, TValue> => {
  return {
    accessorFn: (_row, index) => index as TValue,
    id: ROW_ACTIONS_COLUMN_ID,
    minSize: MIN_COLUMN_WIDTH,
    enableSorting: false,
    enableResizing: true,
    enablePinning: true,
    cell: ({ row, table }) => {
      // HACK: When table has client-side sorting we cannot use row.index for the index column as it shows
      // row index in the original dataset
      const value = shouldShowIndex
        ? table
            .getSortedRowModel()
            ?.flatRows?.findIndex((flatRow) => flatRow.id === row.id) + 1
        : null;
      return (
        <RowIdCell
          canExpand={canExpand}
          value={value}
          backgroundColor={getBackgroundColor?.(row.index)}
          onRowExpandClick={() => onRowExpandClick?.(row.index)}
        />
      );
    },
    header: () => {
      return <RowIdHeaderCell name={shouldShowIndex ? "#" : ""} />;
    },
  };
};
