import { type ReactNode, useMemo } from "react";
import { t } from "ttag";

import { useListDatabasesQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { ListEmptyState } from "metabase/common/components/ListEmptyState";
import { PageContainer } from "metabase/data-studio/common/components/PageContainer";
import { usePageTitle } from "metabase/hooks/use-page-title";
import {
  Center,
  Ellipsified,
  FixedSizeIcon,
  Group,
  Stack,
  Text,
  TreeTable,
  type TreeTableColumnDef,
  useTreeTableInstance,
} from "metabase/ui";
import { useGetCurrentWorkspaceQuery } from "metabase-enterprise/api";
import type {
  Database,
  DatabaseId,
  WorkspaceInstance,
  WorkspaceInstanceDatabase,
} from "metabase-types/api";

import { TitleSection } from "../TitleSection";

import { WorkspaceInstanceHeader } from "./WorkspaceInstanceHeader";

type WorkspaceOverviewDatabaseRow = {
  databaseId: DatabaseId;
  database?: Database;
  config: WorkspaceInstanceDatabase;
};

export function WorkspaceInstanceOverview() {
  usePageTitle(t`Workspace`);

  const {
    data: workspace,
    isLoading: isLoadingWorkspace,
    error: workspaceError,
  } = useGetCurrentWorkspaceQuery();

  const {
    data: databasesResponse,
    isLoading: isLoadingDatabases,
    error: databasesError,
  } = useListDatabasesQuery();

  const databasesById = useMemo(
    () => toDatabasesById(databasesResponse?.data ?? []),
    [databasesResponse],
  );

  const isLoading = isLoadingWorkspace || isLoadingDatabases;
  const error = workspaceError ?? databasesError;

  return (
    <PageContainer data-testid="workspace-instance-overview" gap="xl">
      <WorkspaceInstanceHeader workspaceName={workspace?.name} />
      {isLoading || error != null || workspace == null ? (
        <Center h="100%">
          <LoadingAndErrorWrapper loading={isLoading} error={error} />
        </Center>
      ) : (
        <WorkspaceOverview
          workspace={workspace}
          databasesById={databasesById}
        />
      )}
    </PageContainer>
  );
}

type WorkspaceOverviewProps = {
  workspace: WorkspaceInstance;
  databasesById: Map<DatabaseId, Database>;
};

function WorkspaceOverview({
  workspace,
  databasesById,
}: WorkspaceOverviewProps) {
  const databaseEntries = useMemo(
    () => toDatabaseEntries(workspace.databases),
    [workspace.databases],
  );

  return (
    <Stack gap="xl">
      <WorkspaceDetailsSection
        workspace={workspace}
        databaseCount={databaseEntries.length}
      />
      <TitleSection
        label={t`Database isolation`}
        description={t`Readable schemas and the isolation schema configured for each database in this workspace.`}
      >
        <DatabaseOverviewTable
          entries={databaseEntries}
          databasesById={databasesById}
        />
      </TitleSection>
    </Stack>
  );
}

type WorkspaceDetailsSectionProps = {
  workspace: WorkspaceInstance;
  databaseCount: number;
};

function WorkspaceDetailsSection({
  workspace,
  databaseCount,
}: WorkspaceDetailsSectionProps) {
  return (
    <TitleSection
      label={t`Workspace`}
      description={t`The active workspace configuration on this Metabase instance.`}
    >
      <Stack p="lg" gap="md">
        <DetailRow
          label={t`Name`}
          value={<Text fw="bold">{workspace.name}</Text>}
        />
        <DetailRow label={t`Databases`} value={<Text>{databaseCount}</Text>} />
        <DetailRow
          label={t`Table remappings`}
          value={<Text>{workspace.remappings_count}</Text>}
        />
      </Stack>
    </TitleSection>
  );
}

type DetailRowProps = {
  label: string;
  value: ReactNode;
};

function DetailRow({ label, value }: DetailRowProps) {
  return (
    <Group wrap="nowrap" gap="md" align="baseline">
      <Text c="text-secondary" w="10rem" flex="0 0 auto">
        {label}
      </Text>
      {value}
    </Group>
  );
}

type DatabaseOverviewTableProps = {
  entries: WorkspaceOverviewDatabaseRow[];
  databasesById: Map<DatabaseId, Database>;
};

function DatabaseOverviewTable({
  entries,
  databasesById,
}: DatabaseOverviewTableProps) {
  const rows = useMemo(
    () =>
      entries.map((entry) => ({
        ...entry,
        database: databasesById.get(entry.databaseId) ?? entry.database,
      })),
    [entries, databasesById],
  );

  const columns = useMemo(() => getOverviewColumns(), []);

  const treeTableInstance = useTreeTableInstance<WorkspaceOverviewDatabaseRow>({
    data: rows,
    columns,
    getNodeId: (row) => String(row.databaseId),
  });

  if (entries.length === 0) {
    return (
      <Center p="xl">
        <ListEmptyState label={t`No databases in this workspace`} />
      </Center>
    );
  }

  return (
    <TreeTable
      instance={treeTableInstance}
      ariaLabel={t`Workspace databases`}
    />
  );
}

function getOverviewColumns(): TreeTableColumnDef<WorkspaceOverviewDatabaseRow>[] {
  return [
    {
      id: "database",
      header: t`Database`,
      width: "auto",
      minWidth: 200,
      accessorFn: (row) => row.database?.name ?? row.config.name,
      cell: ({ row }) => (
        <Group align="center" gap="sm" miw={0} wrap="nowrap">
          <FixedSizeIcon name="database" />
          <Ellipsified tooltipProps={{ openDelay: 300 }}>
            {row.original.database?.name ?? row.original.config.name}
          </Ellipsified>
        </Group>
      ),
    },
    {
      id: "input_schemas",
      header: t`Readable schemas`,
      width: "auto",
      minWidth: 200,
      accessorFn: (row) => row.config.input_schemas.join(", "),
      cell: ({ getValue }) => <Ellipsified>{String(getValue())}</Ellipsified>,
    },
    {
      id: "output_schema",
      header: t`Isolation schema`,
      width: "auto",
      minWidth: 200,
      accessorFn: (row) => row.config.output_schema,
      cell: ({ getValue }) => <Ellipsified>{String(getValue())}</Ellipsified>,
    },
  ];
}

function toDatabasesById(databases: Database[]): Map<DatabaseId, Database> {
  const map = new Map<DatabaseId, Database>();
  for (const database of databases) {
    map.set(database.id, database);
  }
  return map;
}

function toDatabaseEntries(
  databases: WorkspaceInstance["databases"],
): WorkspaceOverviewDatabaseRow[] {
  return Object.entries(databases).map(([id, config]) => ({
    databaseId: Number(id),
    config,
  }));
}
