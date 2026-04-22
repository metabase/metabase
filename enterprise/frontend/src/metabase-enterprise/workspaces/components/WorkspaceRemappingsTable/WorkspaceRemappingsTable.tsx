import { useMemo } from "react";
import { t } from "ttag";

import { DateTime } from "metabase/common/components/DateTime";
import { Link } from "metabase/common/components/Link";
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
import * as Urls from "metabase/utils/urls";
import type {
  Database,
  DatabaseId,
  TableId,
  WorkspaceInstance,
  WorkspaceRemapping,
} from "metabase-types/api";

import S from "./WorkspaceRemappingsTable.module.css";

type WorkspaceRemappingsTableProps = {
  remappings: WorkspaceRemapping[];
  databasesById: Map<DatabaseId, Database>;
  workspaceDatabases: WorkspaceInstance["databases"];
};

export function WorkspaceRemappingsTable({
  remappings,
  databasesById,
  workspaceDatabases,
}: WorkspaceRemappingsTableProps) {
  const columns = useMemo(
    () => getColumns({ databasesById, workspaceDatabases }),
    [databasesById, workspaceDatabases],
  );

  const treeTableInstance = useTreeTableInstance<WorkspaceRemapping>({
    data: remappings,
    columns,
    getNodeId: (remapping) => String(remapping.id),
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
      />
    </Card>
  );
}

type SchemaTableCellProps = {
  database: Database | undefined;
  schema: string;
  tableName: string;
  tableId: TableId | null;
};

function SchemaTableCell({
  database,
  schema,
  tableName,
  tableId,
}: SchemaTableCellProps) {
  const schemaHref =
    database != null
      ? Urls.browseSchema({ db_id: database.id, schema_name: schema })
      : undefined;
  const tableHref =
    tableId != null && database != null
      ? Urls.tableRowsQuery(database.id, tableId)
      : undefined;

  return (
    <Group align="center" gap="sm" miw={0} wrap="nowrap">
      <FixedSizeIcon name="table2" />
      <Ellipsified tooltipProps={{ openDelay: 300 }}>
        <MaybeLink href={schemaHref}>{schema}</MaybeLink>
        <Text component="span" c="text-dark" mx={2}>
          /
        </Text>
        <MaybeLink href={tableHref}>{tableName}</MaybeLink>
      </Ellipsified>
    </Group>
  );
}

type DatabaseCellProps = {
  database: Database | undefined;
  fallbackName: string;
};

function DatabaseCell({ database, fallbackName }: DatabaseCellProps) {
  const name = database?.name ?? fallbackName;
  const href =
    database != null
      ? Urls.browseDatabase({ id: database.id, name: database.name })
      : undefined;

  return (
    <Group align="center" gap="sm" miw={0} wrap="nowrap">
      <FixedSizeIcon name="database" />
      <Ellipsified tooltipProps={{ openDelay: 300 }}>
        <MaybeLink href={href}>{name}</MaybeLink>
      </Ellipsified>
    </Group>
  );
}

type MaybeLinkProps = {
  href: string | undefined;
  children: string;
};

function MaybeLink({ href, children }: MaybeLinkProps) {
  if (href == null) {
    return <span className={S.link}>{children}</span>;
  }
  return (
    <Link
      to={href}
      className={S.link}
      onClick={(event) => event.stopPropagation()}
    >
      {children}
    </Link>
  );
}

type GetColumnsParams = {
  databasesById: Map<DatabaseId, Database>;
  workspaceDatabases: WorkspaceInstance["databases"];
};

function getSchemaTableColumn(
  id: "from" | "to",
  header: string,
  databasesById: Map<DatabaseId, Database>,
): TreeTableColumnDef<WorkspaceRemapping> {
  const schemaField = `${id}_schema` as const;
  const tableNameField = `${id}_table_name` as const;
  const tableIdField = `${id}_table_id` as const;

  return {
    id,
    header,
    width: "auto",
    accessorFn: (remapping) =>
      `${remapping[schemaField]}.${remapping[tableNameField]}`,
    cell: ({ row }) => (
      <SchemaTableCell
        database={databasesById.get(row.original.database_id)}
        schema={row.original[schemaField]}
        tableName={row.original[tableNameField]}
        tableId={row.original[tableIdField]}
      />
    ),
  };
}

function getColumns({
  databasesById,
  workspaceDatabases,
}: GetColumnsParams): TreeTableColumnDef<WorkspaceRemapping>[] {
  return [
    getSchemaTableColumn("from", t`From table`, databasesById),
    getSchemaTableColumn("to", t`To table`, databasesById),
    {
      id: "database",
      header: t`Database`,
      width: "auto",
      accessorFn: (remapping) => {
        const database = databasesById.get(remapping.database_id);
        return (
          database?.name ??
          workspaceDatabases[remapping.database_id]?.name ??
          t`Database ${remapping.database_id}`
        );
      },
      cell: ({ row }) => (
        <DatabaseCell
          database={databasesById.get(row.original.database_id)}
          fallbackName={
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
