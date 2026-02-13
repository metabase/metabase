import { t } from "ttag";

import type { TreeTableColumnDef } from "metabase/ui";
import type { ReplaceSourceColumnInfo } from "metabase-types/api";

import { ColumnNameCell } from "../ColumnNameCell";

import type { ColumnErrorItem } from "./types";

export function getRows(columns: ReplaceSourceColumnInfo[]): ColumnErrorItem[] {
  return columns.map((column) => ({
    id: column.name,
    column: column,
  }));
}

export function getColumns(): TreeTableColumnDef<ColumnErrorItem>[] {
  return [getFieldColumn()];
}

function getFieldColumn(): TreeTableColumnDef<ColumnErrorItem> {
  return {
    id: "name",
    header: t`Field`,
    width: "auto",
    maxAutoWidth: 520,
    accessorFn: (item) => item.column.display_name,
    cell: ({ row }) => <ColumnNameCell column={row.original.column} />,
  };
}
