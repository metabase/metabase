import { t } from "ttag";

import { Ellipsified } from "metabase/common/components/Ellipsified";
import type { TreeTableColumnDef } from "metabase/ui";
import type { MissingForeignKeyReplaceSourceError } from "metabase-types/api";

import type { MissingForeignKeyErrorItem } from "./types";

export function getRows(
  error: MissingForeignKeyReplaceSourceError,
): MissingForeignKeyErrorItem[] {
  return error.columns.map((column) => ({
    id: column.name,
    name: column.name,
    database_type: column.database_type,
  }));
}

export function getColumns(): TreeTableColumnDef<MissingForeignKeyErrorItem>[] {
  return [getFieldColumn(), getFieldTypeColumn()];
}

function getFieldColumn(): TreeTableColumnDef<MissingForeignKeyErrorItem> {
  return {
    id: "name",
    header: t`Field`,
    width: "auto",
    maxAutoWidth: 520,
    accessorFn: (item) => item.name,
    cell: ({ row }) => <Ellipsified>{row.original.name}</Ellipsified>,
  };
}

function getFieldTypeColumn(): TreeTableColumnDef<MissingForeignKeyErrorItem> {
  return {
    id: "database_type",
    header: t`Field type`,
    width: "auto",
    maxAutoWidth: 520,
    accessorFn: (item) => item.database_type,
    cell: ({ row }) => <Ellipsified>{row.original.database_type}</Ellipsified>,
  };
}
