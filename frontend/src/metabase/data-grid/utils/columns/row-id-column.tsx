import type { ColumnDef } from "@tanstack/react-table";

import { RowIdCell } from "metabase/data-grid/components/RowIdCell/RowIdCell";
import { RowIdHeaderCell } from "metabase/data-grid/components/RowIdHeaderCell/RowIdHeaderCell";
import { ROW_ID_COLUMN_ID } from "metabase/data-grid/constants";
import type {
  RowIdColumnOptions,
  RowIdVariant,
} from "metabase/data-grid/types";

export const getRowIdColumnSize = (variant: RowIdVariant) =>
  variant === "expandButton" ? 40 : 46;

export const getRowIdColumn = <TRow, TValue>({
  variant,
  getBackgroundColor,
}: RowIdColumnOptions): ColumnDef<TRow, TValue> => {
  const shouldShowIndex = ["indexOnly", "indexExpand"].includes(variant);
  return {
    accessorFn: (_row, index) => index as TValue,
    id: ROW_ID_COLUMN_ID,
    size: getRowIdColumnSize(variant),
    enableSorting: false,
    enableResizing: false,
    enablePinning: true,
    cell: ({ row }) => {
      const value = shouldShowIndex ? row.index + 1 : null;
      return (
        <RowIdCell
          value={value}
          backgroundColor={getBackgroundColor?.(row.index)}
        />
      );
    },
    header: () => {
      return <RowIdHeaderCell name={shouldShowIndex ? "#" : ""} />;
    },
  };
};
