import { t } from "ttag";

import { Ellipsified } from "metabase/common/components/Ellipsified";
import type { TreeTableColumnDef } from "metabase/ui";
import type { ReplaceSourceColumnInfo } from "metabase-types/api";

import { ColumnNameCell } from "./ColumnNameCell";
import type { ErrorItem } from "./types";

export function getRows(columns: ReplaceSourceColumnInfo[]): ErrorItem[] {
  return columns.map((column) => ({
    id: column.name,
    column,
  }));
}

export function getColumns(): TreeTableColumnDef<ErrorItem>[] {
  return [
    {
      id: "name",
      header: t`Field`,
      width: "auto",
      maxAutoWidth: 520,
      accessorFn: (item) => item.column.display_name,
      cell: ({ row }) => <ColumnNameCell column={row.original.column} />,
    },
    {
      id: "description",
      header: t`Description`,
      width: "auto",
      maxAutoWidth: 520,
      accessorFn: (item) => item.column.description ?? "",
      cell: ({ row }) => (
        <Ellipsified>{row.original.column.description}</Ellipsified>
      ),
    },
  ];
}
