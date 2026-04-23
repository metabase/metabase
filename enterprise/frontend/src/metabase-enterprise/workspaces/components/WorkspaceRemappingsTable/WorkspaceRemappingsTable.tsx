import type { Row } from "@tanstack/react-table";
import { useCallback, useMemo } from "react";
import { t } from "ttag";

import { DateTime } from "metabase/common/components/DateTime";
import { ListEmptyState } from "metabase/common/components/ListEmptyState";
import CS from "metabase/css/core/index.css";
import {
  Card,
  Ellipsified,
  FixedSizeIcon,
  Group,
  Text,
  TreeTable,
  type TreeTableColumnDef,
  useTreeTableInstance,
} from "metabase/ui";
import type {
  Database,
  DatabaseId,
  WorkspaceInstance,
  WorkspaceRemapping,
  WorkspaceRemappingId,
} from "metabase-types/api";

type WorkspaceRemappingsTableProps = {
  remappings: WorkspaceRemapping[];
  databasesById: Map<DatabaseId, Database>;
  workspaceDatabases: WorkspaceInstance["databases"];
  selectedRemappingId: WorkspaceRemappingId | undefined;
  onRemappingSelect: (remapping: WorkspaceRemapping) => void;
};

export function WorkspaceRemappingsTable({
  remappings,
  databasesById,
  workspaceDatabases,
  selectedRemappingId,
  onRemappingSelect,
}: WorkspaceRemappingsTableProps) {
  const columns = useMemo(
    () => getColumns({ databasesById, workspaceDatabases }),
    [databasesById, workspaceDatabases],
  );

  const handleRowClick = useCallback(
    (row: Row<WorkspaceRemapping>) => onRemappingSelect(row.original),
    [onRemappingSelect],
  );

  const treeTableInstance = useTreeTableInstance<WorkspaceRemapping>({
    data: remappings,
    columns,
    getNodeId: (remapping) => String(remapping.id),
    selectedRowId:
      selectedRemappingId != null ? String(selectedRemappingId) : undefined,
    onRowActivate: handleRowClick,
  });

  return (
    <Card
      className={CS.overflowHidden}
      p={0}
      flex="0 1 auto"
      mih={0}
      shadow="none"
      withBorder
      data-testid="workspace-remappings-table"
    >
      <TreeTable
        instance={treeTableInstance}
        emptyState={<ListEmptyState label={t`No remappings yet`} />}
        ariaLabel={t`Workspace remappings`}
        onRowClick={handleRowClick}
      />
    </Card>
  );
}

type SchemaTableCellProps = {
  schema: string;
  tableName: string;
};

function SchemaTableCell({ schema, tableName }: SchemaTableCellProps) {
  return (
    <Group align="center" gap="sm" miw={0} wrap="nowrap">
      <FixedSizeIcon name="table2" />
      <Ellipsified tooltipProps={{ openDelay: 300 }}>
        {schema}
        <Text component="span" c="text-primary" mx={2}>
          /
        </Text>
        {tableName}
      </Ellipsified>
    </Group>
  );
}

type DatabaseCellProps = {
  name: string;
};

function DatabaseCell({ name }: DatabaseCellProps) {
  return (
    <Group align="center" gap="sm" miw={0} wrap="nowrap">
      <FixedSizeIcon name="database" />
      <Ellipsified tooltipProps={{ openDelay: 300 }}>{name}</Ellipsified>
    </Group>
  );
}

type GetColumnsParams = {
  databasesById: Map<DatabaseId, Database>;
  workspaceDatabases: WorkspaceInstance["databases"];
};

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

function getColumns({
  databasesById,
  workspaceDatabases,
}: GetColumnsParams): TreeTableColumnDef<WorkspaceRemapping>[] {
  return [
    getSchemaTableColumn("from", t`Table`),
    getSchemaTableColumn("to", t`Mapped to`),
    {
      id: "database",
      header: t`Database`,
      width: "auto",
      accessorFn: (remapping) =>
        databasesById.get(remapping.database_id)?.name ??
        workspaceDatabases[remapping.database_id]?.name ??
        t`Database ${remapping.database_id}`,
      cell: ({ row }) => (
        <DatabaseCell
          name={
            databasesById.get(row.original.database_id)?.name ??
            workspaceDatabases[row.original.database_id]?.name ??
            t`Database ${row.original.database_id}`
          }
        />
      ),
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
