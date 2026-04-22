import { t } from "ttag";

import { Ellipsified, type TreeTableColumnDef } from "metabase/ui";
import type { Database, WorkspaceDatabaseDraft } from "metabase-types/api";

export type DatabaseMappingRow = WorkspaceDatabaseDraft & { id: number };

export function getDatabaseColumn(
  databases: Database[],
): TreeTableColumnDef<DatabaseMappingRow> {
  const databasesById: Record<number, Database> = Object.fromEntries(
    databases.map((database) => [database.id, database]),
  );
  return {
    id: "database",
    header: t`Database`,
    width: "auto",
    minWidth: 200,
    accessorFn: (row) => databasesById[row.database_id]?.name ?? "",
    cell: ({ row }) => {
      const name =
        databasesById[row.original.database_id]?.name ??
        String(row.original.database_id);
      return <Ellipsified>{name}</Ellipsified>;
    },
  };
}

export function getInputSchemasColumn(): TreeTableColumnDef<DatabaseMappingRow> {
  return {
    id: "input_schemas",
    header: t`Input schemas`,
    width: "auto",
    minWidth: 200,
    accessorFn: (row) => row.input_schemas.join(", "),
    cell: ({ row }) => (
      <Ellipsified>{row.original.input_schemas.join(", ")}</Ellipsified>
    ),
  };
}

export function getOutputSchemaColumn(): TreeTableColumnDef<DatabaseMappingRow> {
  return {
    id: "output_schema",
    header: t`Output schema`,
    width: "auto",
    minWidth: 200,
    accessorFn: (row) => row.output_schema ?? "",
    cell: ({ row }) => (
      <Ellipsified>{row.original.output_schema ?? ""}</Ellipsified>
    ),
  };
}

export function getColumns(
  databases: Database[],
): TreeTableColumnDef<DatabaseMappingRow>[] {
  return [
    getDatabaseColumn(databases),
    getInputSchemasColumn(),
    getOutputSchemaColumn(),
  ];
}

export const COLUMN_WIDTHS = [0.34, 0.33, 0.33];

export function toMappingRow(
  mapping: WorkspaceDatabaseDraft,
): DatabaseMappingRow {
  return { ...mapping, id: mapping.database_id };
}
