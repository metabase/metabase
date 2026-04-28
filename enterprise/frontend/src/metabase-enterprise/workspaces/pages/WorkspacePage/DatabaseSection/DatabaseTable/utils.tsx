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

export function getSchemasColumn(): TreeTableColumnDef<DatabaseRow> {
  return {
    id: "schemas",
    header: t`Schemas`,
    width: "auto",
    minWidth: 200,
    accessorFn: (row) => row.workspaceDatabase.input_schemas.join(", "),
    cell: ({ getValue }) => <Ellipsified>{String(getValue())}</Ellipsified>,
  };
}

export function getColumns(): TreeTableColumnDef<DatabaseRow>[] {
  return [getDatabaseColumn(), getSchemasColumn()];
}
