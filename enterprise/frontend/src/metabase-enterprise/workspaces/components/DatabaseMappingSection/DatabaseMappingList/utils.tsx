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

export function getSchemasColumn(): TreeTableColumnDef<DatabaseMappingRow> {
  return {
    id: "input_schemas",
    header: t`Accessible schemas`,
    width: "auto",
    minWidth: 200,
    accessorFn: (row) => row.input_schemas.join(", "),
    cell: ({ row }) => (
      <Ellipsified>{row.original.input_schemas.join(", ")}</Ellipsified>
    ),
  };
}

export function getColumns(
  databases: Database[],
): TreeTableColumnDef<DatabaseMappingRow>[] {
  return [getDatabaseColumn(databases), getSchemasColumn()];
}

export const COLUMN_WIDTHS = [0.5, 0.5];

export function toMappingRow(
  mapping: WorkspaceDatabaseDraft,
): DatabaseMappingRow {
  return { ...mapping, id: mapping.database_id };
}
