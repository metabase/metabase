import { t } from "ttag";

import { Ellipsified, type TreeTableColumnDef } from "metabase/ui";
import type {
  Database,
  DatabaseId,
  WorkspaceDatabase,
} from "metabase-types/api";

import { DatabaseMenu } from "../DatabaseMenu";

import type { DatabaseRow } from "./types";

export function getRows(
  workspaceDatabases: WorkspaceDatabase[],
  databasesById: Map<DatabaseId, Database>,
): DatabaseRow[] {
  return workspaceDatabases.reduce<DatabaseRow[]>((rows, workspaceDatabase) => {
    const database = databasesById.get(workspaceDatabase.database_id);
    if (database != null) {
      rows.push({
        id: workspaceDatabase.database_id,
        workspaceDatabase,
        database,
      });
    }
    return rows;
  }, []);
}

export function getDatabaseColumn(): TreeTableColumnDef<DatabaseRow> {
  return {
    id: "database",
    header: t`Database`,
    width: "auto",
    minWidth: 200,
    accessorFn: (row) => row.database.name,
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
    header: t`Isolation schema`,
    minWidth: 200,
    accessorFn: (row) => row.workspaceDatabase.output_schema,
    cell: ({ getValue }) => <Ellipsified>{String(getValue())}</Ellipsified>,
  };
}

export function getMenuColumn(
  onEdit: (workspaceDatabase: WorkspaceDatabase) => void,
  onDelete: (workspaceDatabase: WorkspaceDatabase) => void,
): TreeTableColumnDef<DatabaseRow> {
  return {
    id: "actions",
    header: "",
    width: "auto",
    cell: ({ row }) => (
      <DatabaseMenu
        workspaceDatabase={row.original.workspaceDatabase}
        onEdit={onEdit}
        onDelete={onDelete}
      />
    ),
  };
}

export function getColumns(
  onEdit: (workspaceDatabase: WorkspaceDatabase) => void,
  onDelete: (workspaceDatabase: WorkspaceDatabase) => void,
): TreeTableColumnDef<DatabaseRow>[] {
  return [
    getDatabaseColumn(),
    getReadableSchemasColumn(),
    getWritableSchemaColumn(),
    getMenuColumn(onEdit, onDelete),
  ];
}
