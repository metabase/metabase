import { t } from "ttag";

import type { TreeTableColumnDef } from "metabase/ui";
import type { ReplaceSourceColumnCompareInfo } from "metabase-types/api";

import { ColumnNameCell } from "../ColumnNameCell";

import type { ColumnCompareErrorItem } from "./types";

export function getRows(
  columns: ReplaceSourceColumnCompareInfo[],
): ColumnCompareErrorItem[] {
  return columns.map((compare) => ({
    id: compare.target.name,
    compare,
  }));
}

export function getColumns(): TreeTableColumnDef<ColumnCompareErrorItem>[] {
  return [getFieldColumn(), getOriginalFieldColumn()];
}

function getFieldColumn(): TreeTableColumnDef<ColumnCompareErrorItem> {
  return {
    id: "field",
    header: t`Field`,
    width: "auto",
    maxAutoWidth: 520,
    accessorFn: (item) => item.compare.target.display_name,
    cell: ({ row }) => <ColumnNameCell column={row.original.compare.target} />,
  };
}

function getOriginalFieldColumn(): TreeTableColumnDef<ColumnCompareErrorItem> {
  return {
    id: "original-field",
    header: t`Original field`,
    width: "auto",
    maxAutoWidth: 520,
    accessorFn: (item) => item.compare.source.display_name,
    cell: ({ row }) => <ColumnNameCell column={row.original.compare.source} />,
  };
}
