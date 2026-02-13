import { t } from "ttag";

import { Ellipsified } from "metabase/common/components/Ellipsified";
import type { TreeTableColumnDef } from "metabase/ui";
import type { MissingPrimaryKeyReplaceSourceError } from "metabase-types/api";

import type { MissingPrimaryKeyErrorItem } from "./types";

export function getRows(
  error: MissingPrimaryKeyReplaceSourceError,
): MissingPrimaryKeyErrorItem[] {
  return error.columns.map((column) => ({
    id: column.name,
    name: column.name,
    database_type: column.database_type,
  }));
}

export function getColumns(): TreeTableColumnDef<MissingPrimaryKeyErrorItem>[] {
  return [getFieldColumn(), getFieldTypeColumn()];
}

function getFieldColumn(): TreeTableColumnDef<MissingPrimaryKeyErrorItem> {
  return {
    id: "name",
    header: t`Field`,
    width: "auto",
    maxAutoWidth: 520,
    accessorFn: (item) => item.name,
    cell: ({ row }) => <Ellipsified>{row.original.name}</Ellipsified>,
  };
}

function getFieldTypeColumn(): TreeTableColumnDef<MissingPrimaryKeyErrorItem> {
  return {
    id: "database_type",
    header: t`Field type`,
    width: "auto",
    maxAutoWidth: 520,
    accessorFn: (item) => item.database_type,
    cell: ({ row }) => <Ellipsified>{row.original.database_type}</Ellipsified>,
  };
}
