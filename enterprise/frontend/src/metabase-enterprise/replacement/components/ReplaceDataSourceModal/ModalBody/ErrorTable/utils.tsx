import { t } from "ttag";

import { Ellipsified } from "metabase/common/components/Ellipsified";
import type { TreeTableColumnDef } from "metabase/ui";
import type {
  ReplaceSourceError,
  ReplaceSourceErrorType,
} from "metabase-types/api";

import type { ReplaceSourceErrorItem } from "./types";

export function getRows(
  errors: ReplaceSourceError[],
  errorType: ReplaceSourceErrorType,
): ReplaceSourceErrorItem[] {
  return errors
    .filter((error) => error.type === errorType)
    .map((error) => ({
      ...error,
      id: error.name,
    }));
}

export function getColumns(
  errorType: ReplaceSourceErrorType,
): TreeTableColumnDef<ReplaceSourceErrorItem>[] {
  switch (errorType) {
    case "missing-column":
      return [getFieldColumn(), getFieldTypeColumn()];
    case "column-type-mismatch":
      return [getFieldColumn(), getSourceTypeColumn(), getTargetTypeColumn()];
    case "missing-primary-key":
      return [getFieldColumn(), getFieldTypeColumn()];
    case "extra-primary-key":
      return [getFieldColumn(), getFieldTypeColumn()];
    case "missing-foreign-key":
      return [
        getFieldColumn(),
        getSourceForeignKeyFieldColumn(),
        getSourceForeignKeyTableColumn(),
      ];
    case "foreign-key-mismatch":
      return [
        getFieldColumn(),
        getSourceForeignKeyFieldColumn(),
        getSourceForeignKeyTableColumn(),
        getTargetForeignKeyFieldColumn(),
        getTargetForeignKeyTableColumn(),
      ];
  }
}

function getFieldColumn(): TreeTableColumnDef<ReplaceSourceErrorItem> {
  return {
    id: "name",
    header: t`Field`,
    width: "auto",
    maxAutoWidth: 520,
    accessorFn: (error) => error.name,
    cell: ({ row }) => <Ellipsified>{row.original.name}</Ellipsified>,
  };
}

function getFieldTypeColumn(): TreeTableColumnDef<ReplaceSourceErrorItem> {
  return {
    id: "database_type",
    header: t`Field type`,
    width: "auto",
    maxAutoWidth: 520,
    accessorFn: (error) => error.database_type,
    cell: ({ row }) => <Ellipsified>{row.original.database_type}</Ellipsified>,
  };
}

function getSourceTypeColumn(): TreeTableColumnDef<ReplaceSourceErrorItem> {
  return {
    id: "source_database_type",
    header: t`Source type`,
    width: "auto",
    maxAutoWidth: 520,
    accessorFn: (error) => error.source_database_type,
    cell: ({ row }) => (
      <Ellipsified>{row.original.source_database_type}</Ellipsified>
    ),
  };
}

function getTargetTypeColumn(): TreeTableColumnDef<ReplaceSourceErrorItem> {
  return {
    id: "target_database_type",
    header: t`Target type`,
    width: "auto",
    maxAutoWidth: 520,
    accessorFn: (error) => error.target_database_type,
    cell: ({ row }) => (
      <Ellipsified>{row.original.target_database_type}</Ellipsified>
    ),
  };
}

function getSourceForeignKeyFieldColumn(): TreeTableColumnDef<ReplaceSourceErrorItem> {
  return {
    id: "source_fk_target_field_name",
    header: t`Target field`,
    width: "auto",
    maxAutoWidth: 520,
    accessorFn: (error) => error.source_fk_target_field_name,
    cell: ({ row }) => (
      <Ellipsified>{row.original.source_fk_target_field_name}</Ellipsified>
    ),
  };
}

function getSourceForeignKeyTableColumn(): TreeTableColumnDef<ReplaceSourceErrorItem> {
  return {
    id: "source_fk_target_table_name",
    header: t`Target table`,
    width: "auto",
    maxAutoWidth: 520,
    accessorFn: (error) => error.source_fk_target_table_name,
    cell: ({ row }) => (
      <Ellipsified>{row.original.source_fk_target_table_name}</Ellipsified>
    ),
  };
}

function getTargetForeignKeyFieldColumn(): TreeTableColumnDef<ReplaceSourceErrorItem> {
  return {
    id: "target_fk_target_field_name",
    header: t`Target target field`,
    width: "auto",
    maxAutoWidth: 520,
    accessorFn: (error) => error.target_fk_target_field_name,
    cell: ({ row }) => (
      <Ellipsified>{row.original.target_fk_target_field_name}</Ellipsified>
    ),
  };
}

function getTargetForeignKeyTableColumn(): TreeTableColumnDef<ReplaceSourceErrorItem> {
  return {
    id: "target_fk_target_table_name",
    header: t`Target target table`,
    width: "auto",
    maxAutoWidth: 520,
    accessorFn: (error) => error.target_fk_target_table_name,
    cell: ({ row }) => (
      <Ellipsified>{row.original.target_fk_target_table_name}</Ellipsified>
    ),
  };
}
