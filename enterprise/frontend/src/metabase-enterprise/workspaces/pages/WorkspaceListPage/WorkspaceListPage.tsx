import { t } from "ttag";

import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { DataStudioBreadcrumbs } from "metabase/data-studio/common/components/DataStudioBreadcrumbs";
import { PageContainer } from "metabase/data-studio/common/components/PageContainer";
import { PaneHeader } from "metabase/data-studio/common/components/PaneHeader";
import { Flex } from "metabase/ui";
import {
  useListWorkspaceInstancesQuery,
  useListWorkspacesQuery,
} from "metabase-enterprise/api";
import type { Workspace, WorkspaceInstance } from "metabase-types/api";

import { WorkspaceInstanceEmptyState } from "./WorkspaceInstanceEmptyState";
import { WorkspaceInstanceSection } from "./WorkspaceInstanceSection/WorkspaceInstanceSection";
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
  const isLoading = isLoadingWorkspaces || isLoadingInstances;
  const error = workspacesError ?? instancesError;

  if (isLoading || error != null || workspaces == null || instances == null) {
    return <DelayedLoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <WorkspaceListPageBody workspaces={workspaces} instances={instances} />
  );
}

type WorkspaceListPageBodyProps = {
  workspaces: Workspace[];
  instances: WorkspaceInstance[];
};

function WorkspaceListPageBody({
  workspaces,
  instances,
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
          <WorkspaceInstanceEmptyState />
        </Flex>
      ) : (
        <>
          <WorkspaceSection workspaces={workspaces} />
          <WorkspaceInstanceSection instances={instances} />
        </>
      )}
    </PageContainer>
  );
}
