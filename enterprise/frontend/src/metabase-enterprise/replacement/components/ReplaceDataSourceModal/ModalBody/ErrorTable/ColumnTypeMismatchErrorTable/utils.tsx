import { t } from "ttag";

import { Ellipsified } from "metabase/common/components/Ellipsified";
import type { TreeTableColumnDef } from "metabase/ui";
import type { ColumnTypeMismatchReplaceSourceError } from "metabase-types/api";

import type { ColumnTypeMismatchErrorItem } from "./types";

export function getRows(
  error: ColumnTypeMismatchReplaceSourceError,
): ColumnTypeMismatchErrorItem[] {
  return error.columns.map((column) => ({
    id: column.name,
    name: column.name,
    source_database_type: column.source_database_type,
    target_database_type: column.target_database_type,
  }));
}

export function getColumns(): TreeTableColumnDef<ColumnTypeMismatchErrorItem>[] {
  return [getFieldColumn(), getFieldTypeColumn(), getOriginalFieldTypeColumn()];
}

function getFieldColumn(): TreeTableColumnDef<ColumnTypeMismatchErrorItem> {
  return {
    id: "name",
    header: t`Field`,
    width: "auto",
    maxAutoWidth: 520,
    accessorFn: (item) => item.name,
    cell: ({ row }) => <Ellipsified>{row.original.name}</Ellipsified>,
  };
}

function getFieldTypeColumn(): TreeTableColumnDef<ColumnTypeMismatchErrorItem> {
  return {
    id: "target_database_type",
    header: t`Field type`,
    width: "auto",
    maxAutoWidth: 520,
    accessorFn: (item) => item.target_database_type,
    cell: ({ row }) => (
      <Ellipsified>{row.original.target_database_type}</Ellipsified>
    ),
  };
}

function getOriginalFieldTypeColumn(): TreeTableColumnDef<ColumnTypeMismatchErrorItem> {
  return {
    id: "source_database_type",
    header: t`Original field type`,
    width: "auto",
    maxAutoWidth: 520,
    accessorFn: (item) => item.source_database_type,
    cell: ({ row }) => (
      <Ellipsified>{row.original.source_database_type}</Ellipsified>
    ),
  };
}
