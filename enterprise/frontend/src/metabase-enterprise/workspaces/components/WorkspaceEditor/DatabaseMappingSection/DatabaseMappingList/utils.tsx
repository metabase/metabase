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
    cell: ({ getValue }) => {
      return <Ellipsified>{String(getValue())}</Ellipsified>;
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
    cell: ({ getValue }) => <Ellipsified>{String(getValue())}</Ellipsified>,
  };
}

export function getOutputSchemaColumn(): TreeTableColumnDef<DatabaseMappingRow> {
  return {
    id: "output_schema",
    header: t`Output schema`,
    width: "auto",
    minWidth: 200,
    accessorFn: (row) => row.output_schema ?? "",
    cell: ({ getValue }) => <Ellipsified>{String(getValue())}</Ellipsified>,
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

export function getRows(
  mappings: WorkspaceDatabaseDraft[],
): DatabaseMappingRow[] {
  return mappings.map((mapping) => ({ ...mapping, id: mapping.database_id }));
}
