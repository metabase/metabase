import { t } from "ttag";

import { useListDatabasesQuery } from "metabase/api";
import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { DataStudioBreadcrumbs } from "metabase/common/data-studio/components/DataStudioBreadcrumbs";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import { PaneHeader } from "metabase/common/data-studio/components/PaneHeader";
import { Stack, Title } from "metabase/ui";
import {
  useGetCurrentWorkspaceQuery,
  useListTableRemappingsQuery,
} from "metabase-enterprise/api";
import type {
  CurrentWorkspace,
  Database,
  TableRemapping,
} from "metabase-types/api";

import { DeleteSection } from "./DeleteSection";
import { TableRemappingSection } from "./TableRemappingSection";
import { getDatabasesInfo } from "./utils";

export function CurrentWorkspacePage() {
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
    workspace == null ||
    remappings == null ||
    databasesResponse == null
  ) {
    return <DelayedLoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <CurrentWorkspacePageBody
      workspace={workspace}
      remappings={remappings}
      databases={databasesResponse.data}
    />
  );
}

type CurrentWorkspacePageBodyProps = {
  workspace: CurrentWorkspace;
  remappings: TableRemapping[];
  databases: Database[];
};

function CurrentWorkspacePageBody({
  workspace,
  remappings,
  databases,
}: CurrentWorkspacePageBodyProps) {
  const databasesInfo = getDatabasesInfo(workspace, databases, remappings);

  return (
    <PageContainer data-testid="current-workspace-page">
      <PaneHeader
        title={<Title order={3}>{workspace.name}</Title>}
        breadcrumbs={
          <DataStudioBreadcrumbs>{t`Workspaces`}</DataStudioBreadcrumbs>
        }
        py={0}
      />
      <Stack gap="3.5rem">
        {databasesInfo.map(({ database, remappings }) => (
          <TableRemappingSection
            key={database.id}
            database={database}
            remappings={remappings}
          />
        ))}
        {workspace.can_write && <DeleteSection />}
      </Stack>
    </PageContainer>
  );
}
