import { t } from "ttag";

import { DateTime } from "metabase/common/components/DateTime";
import type { TreeTableColumnDef } from "metabase/ui";
import type {
  Database,
  DatabaseId,
  WorkspaceRemapping,
} from "metabase-types/api";

import { DatabaseCell } from "./DatabaseCell";
import { SchemaTableCell } from "./SchemaTableCell";

type GetColumnsParams = {
  databasesById: Map<DatabaseId, Database>;
};

export function getColumns({
  databasesById,
}: GetColumnsParams): TreeTableColumnDef<WorkspaceRemapping>[] {
  return [
    getSchemaTableColumn("from", t`Table`),
    getSchemaTableColumn("to", t`Mapped to`),
    {
      id: "database",
      header: t`Database`,
      width: "auto",
      accessorFn: (remapping) => databasesById.get(remapping.database_id)?.name,
      cell: ({ getValue }) => {
        const name = getValue<string | undefined>();
        return name != null ? <DatabaseCell name={name} /> : null;
      },
    },
    {
      id: "created_at",
      accessorKey: "created_at",
      header: t`Created at`,
      width: "auto",
      cell: ({ row }) => <DateTime value={row.original.created_at} />,
    },
  ];
}

function getSchemaTableColumn(
  id: "from" | "to",
  header: string,
): TreeTableColumnDef<WorkspaceRemapping> {
  const schemaField = `${id}_schema` as const;
  const tableNameField = `${id}_table_name` as const;

  return {
    id,
    header,
    width: "auto",
    accessorFn: (remapping) =>
      `${remapping[schemaField]}.${remapping[tableNameField]}`,
    cell: ({ row }) => (
      <SchemaTableCell
        schema={row.original[schemaField]}
        tableName={row.original[tableNameField]}
      />
    ),
  };
}
