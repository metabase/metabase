import { t } from "ttag";

import { Ellipsified, type TreeTableColumnDef } from "metabase/ui";
import type { Database, WorkspaceDatabase } from "metabase-types/api";

import type { DatabaseRow } from "./types";

export function getRows(
  workspaceDatabases: WorkspaceDatabase[],
  availableDatabases: Database[],
): DatabaseRow[] {
  const databasesById = new Map(
    availableDatabases.map((database) => [database.id, database]),
  );
  return workspaceDatabases.map((workspaceDatabase) => ({
    id: workspaceDatabase.database_id,
    workspaceDatabase,
    database: databasesById.get(workspaceDatabase.database_id),
  }));
}

export function getDatabaseColumn(): TreeTableColumnDef<DatabaseRow> {
  return {
    id: "database",
    header: t`Database`,
    width: "auto",
    minWidth: 200,
    accessorFn: (row) =>
      row.database?.name ?? `#${row.workspaceDatabase.database_id}`,
    cell: ({ getValue }) => <Ellipsified>{String(getValue())}</Ellipsified>,
  };
}

export function getReadableSchemasColumn(): TreeTableColumnDef<DatabaseRow> {
  return {
    id: "input_schemas",
    header: t`Readable schemas`,
    width: "auto",
    minWidth: 200,
    accessorFn: (row) => row.workspaceDatabase.input_schemas.join(", "),
    cell: ({ getValue }) => <Ellipsified>{String(getValue())}</Ellipsified>,
  };
}

export function getWritableSchemaColumn(): TreeTableColumnDef<DatabaseRow> {
  return {
    id: "output_schema",
    header: t`Writable schema`,
    width: "auto",
    minWidth: 200,
    accessorFn: (row) => row.workspaceDatabase.output_schema,
    cell: ({ getValue }) => <Ellipsified>{String(getValue())}</Ellipsified>,
  };
}

export function getColumns(): TreeTableColumnDef<DatabaseRow>[] {
  return [
    getDatabaseColumn(),
    getReadableSchemasColumn(),
    getWritableSchemaColumn(),
  ];
}
