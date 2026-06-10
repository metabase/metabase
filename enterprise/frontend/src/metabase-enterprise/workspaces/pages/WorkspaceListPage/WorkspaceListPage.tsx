import { t } from "ttag";

import { useListDatabasesQuery } from "metabase/api";
import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { DataStudioBreadcrumbs } from "metabase/data-studio/common/components/DataStudioBreadcrumbs";
import { PageContainer } from "metabase/data-studio/common/components/PageContainer";
import { PaneHeader } from "metabase/data-studio/common/components/PaneHeader";
import { Flex } from "metabase/ui";
import {
  useListWorkspaceInstancesQuery,
  useListWorkspacesQuery,
} from "metabase-enterprise/api";
import type {
  Database,
  Workspace,
  WorkspaceInstance,
} from "metabase-types/api";

import { InstanceEmptyState } from "./InstanceEmptyState";
import { InstanceSection } from "./InstanceSection/InstanceSection";
import { WorkspaceSection } from "./WorkspaceSection/WorkspaceSection";

export function WorkspaceListPage() {
  const {
    data: workspaces,
    isLoading: isLoadingWorkspaces,
    error: workspacesError,
  } = useListWorkspacesQuery();
  const {
    data: instances,
    isLoading: isLoadingInstances,
    error: instancesError,
  } = useListWorkspaceInstancesQuery();
  const {
    data: databasesData,
    isLoading: isLoadingDatabases,
    error: databasesError,
  } = useListDatabasesQuery();
  const databases = databasesData?.data;
  const isLoading =
    isLoadingWorkspaces || isLoadingInstances || isLoadingDatabases;
  const error = workspacesError ?? instancesError ?? databasesError;

  if (
    isLoading ||
    error != null ||
    workspaces == null ||
    instances == null ||
    databases == null
  ) {
    return <DelayedLoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <WorkspaceListPageBody
      workspaces={workspaces}
      instances={instances}
      databases={databases}
    />
  );
}

type WorkspaceListPageBodyProps = {
  workspaces: Workspace[];
  instances: WorkspaceInstance[];
  databases: Database[];
};

function WorkspaceListPageBody({
  workspaces,
  instances,
  databases,
}: WorkspaceListPageBodyProps) {
  return (
    <PageContainer data-testid="workspace-list-page">
      <PaneHeader
        breadcrumbs={
          <DataStudioBreadcrumbs>{t`Workspaces`}</DataStudioBreadcrumbs>
        }
        py={0}
      />
      {instances.length === 0 ? (
        <Flex justify="center">
          <InstanceEmptyState />
        </Flex>
      ) : (
        <>
          <WorkspaceSection
            workspaces={workspaces}
            databases={databases}
            instances={instances}
          />
          <InstanceSection instances={instances} />
        </>
      )}
    </PageContainer>
  );
}
