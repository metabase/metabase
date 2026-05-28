import { t } from "ttag";

import { useListDatabasesQuery } from "metabase/api";
import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { DataStudioBreadcrumbs } from "metabase/data-studio/common/components/DataStudioBreadcrumbs";
import { PageContainer } from "metabase/data-studio/common/components/PageContainer";
import { PaneHeader } from "metabase/data-studio/common/components/PaneHeader";
import { Stack, Title } from "metabase/ui";
import {
  useGetCurrentWorkspaceQuery,
  useListTableRemappingsQuery,
} from "metabase-enterprise/api";
import type {
  Database,
  TableRemapping,
  WorkspaceInstance,
} from "metabase-types/api";

import { HelpMenu } from "../../components/HelpMenu";

import { DeleteSection } from "./DeleteSection";
import { TableRemappingSection } from "./TableRemappingSection";
import { WorkspaceInstanceEmptyState } from "./WorkspaceInstanceEmptyState";
import { getDatabasesInfo } from "./utils";

export function WorkspaceInstancePage() {
  const {
    data: workspace,
    isLoading: isLoadingWorkspace,
    error: workspaceError,
  } = useGetCurrentWorkspaceQuery();
  const {
    data: remappings,
    isLoading: isLoadingRemappings,
    error: remappingsError,
  } = useListTableRemappingsQuery();
  const {
    data: databasesResponse,
    isLoading: isLoadingDatabases,
    error: databasesError,
  } = useListDatabasesQuery();

  const isLoading =
    isLoadingWorkspace || isLoadingRemappings || isLoadingDatabases;
  const error = workspaceError ?? remappingsError ?? databasesError;

  if (
    isLoading ||
    error != null ||
    remappings == null ||
    databasesResponse == null
  ) {
    return <DelayedLoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <WorkspaceInstancePageBody
      workspace={workspace ?? null}
      remappings={remappings}
      databases={databasesResponse.data}
    />
  );
}

type WorkspaceInstancePageBodyProps = {
  workspace: WorkspaceInstance | null;
  remappings: TableRemapping[];
  databases: Database[];
};

function WorkspaceInstancePageBody({
  workspace,
  remappings,
  databases,
}: WorkspaceInstancePageBodyProps) {
  const databasesInfo =
    workspace != null ? getDatabasesInfo(workspace, databases, remappings) : [];

  return (
    <PageContainer data-testid="workspace-instance-page">
      <PaneHeader
        title={
          workspace != null ? <Title order={3}>{workspace.name}</Title> : null
        }
        breadcrumbs={
          <DataStudioBreadcrumbs>{t`Workspaces`}</DataStudioBreadcrumbs>
        }
        actions={workspace != null ? <HelpMenu /> : null}
        py={0}
      />
      {workspace == null ? (
        <WorkspaceInstanceEmptyState />
      ) : (
        <Stack gap="3.5rem">
          {databasesInfo.map(({ database, remappings }) => (
            <TableRemappingSection
              key={database.id}
              database={database}
              remappings={remappings}
            />
          ))}
          <DeleteSection />
        </Stack>
      )}
    </PageContainer>
  );
}
