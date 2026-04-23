import { t } from "ttag";

import { Ellipsified, type TreeTableColumnDef } from "metabase/ui";
import type { Database, WorkspaceDatabaseDraft } from "metabase-types/api";

import type { WorkspaceDatabaseRow } from "./types";

export function getDatabaseColumn(): TreeTableColumnDef<WorkspaceDatabaseRow> {
  return {
    id: "database",
    header: t`Database`,
    width: "auto",
    minWidth: 200,
    accessorFn: (row) => row.database?.name ?? "",
    cell: ({ getValue }) => <Ellipsified>{String(getValue())}</Ellipsified>,
  };
}

export function getInputSchemasColumn(): TreeTableColumnDef<WorkspaceDatabaseRow> {
  return {
    id: "input_schemas",
    header: t`Input schemas`,
    width: "auto",
    minWidth: 200,
    accessorFn: (row) => row.mapping.input_schemas.join(", "),
    cell: ({ getValue }) => <Ellipsified>{String(getValue())}</Ellipsified>,
  };
}

export function getOutputSchemaColumn(): TreeTableColumnDef<WorkspaceDatabaseRow> {
  return {
    id: "output_schema",
    header: t`Output schema`,
    width: "auto",
    minWidth: 200,
    accessorFn: (row) => row.mapping.output_schema ?? "",
    cell: ({ getValue }) => <Ellipsified>{String(getValue())}</Ellipsified>,
  };
}

export function getColumns(): TreeTableColumnDef<WorkspaceDatabaseRow>[] {
  return [
    getDatabaseColumn(),
    getInputSchemasColumn(),
    getOutputSchemaColumn(),
  ];
}

export function getRows(
  mappings: WorkspaceDatabaseDraft[],
  databases: Database[],
): WorkspaceDatabaseRow[] {
  const databasesById = new Map(
    databases.map((database) => [database.id, database]),
  );
  return mappings.map((mapping) => ({
    id: mapping.database_id,
    database: databasesById.get(mapping.database_id),
    mapping,
  }));
}
