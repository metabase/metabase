import { useMemo } from "react";
import { t } from "ttag";

import { useListDatabasesQuery } from "metabase/api";
import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { PageContainer } from "metabase/data-studio/common/components/PageContainer";
import { usePageTitle } from "metabase/hooks/use-page-title";
import { Center, Stack } from "metabase/ui";
import { useGetCurrentWorkspaceQuery } from "metabase-enterprise/api";
import type {
  Database,
  DatabaseId,
  WorkspaceInstance,
} from "metabase-types/api";

import { TitleSection } from "../../components/TitleSection";
import { WorkspaceInstanceHeader } from "../../components/WorkspaceInstanceHeader";
import { toDatabasesById } from "../../utils";

import { DatabaseOverviewTable } from "./DatabaseOverviewTable";
import { WorkspaceDetailsSection } from "./WorkspaceDetailsSection";
import { toDatabaseEntries } from "./utils";

export function WorkspaceInstanceOverviewPage() {
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
          <DelayedLoadingAndErrorWrapper loading={isLoading} error={error} />
        </Center>
      ) : (
        <WorkspaceInstanceOverviewBody
          workspace={workspace}
          databasesById={databasesById}
        />
      )}
    </PageContainer>
  );
}

type WorkspaceInstanceOverviewBodyProps = {
  workspace: WorkspaceInstance;
  databasesById: Map<DatabaseId, Database>;
};

function WorkspaceInstanceOverviewBody({
  workspace,
  databasesById,
}: WorkspaceInstanceOverviewBodyProps) {
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
