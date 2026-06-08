import { Link } from "react-router";
import { t } from "ttag";

import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { DataStudioBreadcrumbs } from "metabase/data-studio/common/components/DataStudioBreadcrumbs";
import { PageContainer } from "metabase/data-studio/common/components/PageContainer";
import { PaneHeader } from "metabase/data-studio/common/components/PaneHeader";
import { Stack } from "metabase/ui";
import * as Urls from "metabase/urls";
import { useListWorkspaceInstancesQuery } from "metabase-enterprise/api";
import type { WorkspaceInstance } from "metabase-types/api";

import { InstanceEmptyState } from "./InstanceEmptyState";
import { InstanceItem } from "./InstanceItem";
import { NewInstanceButton } from "./NewInstanceButton";

export function WorkspaceInstanceListPage() {
  const {
    data: instances,
    isLoading,
    error,
  } = useListWorkspaceInstancesQuery();

  if (isLoading || error != null || instances == null) {
    return <DelayedLoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return <WorkspaceInstanceListPageBody instances={instances} />;
}

type WorkspaceInstanceListPageBodyProps = {
  instances: WorkspaceInstance[];
};

function WorkspaceInstanceListPageBody({
  instances,
}: WorkspaceInstanceListPageBodyProps) {
  const hasInstances = instances.length > 0;

  return (
    <PageContainer data-testid="workspace-instance-list-page">
      <PaneHeader
        breadcrumbs={
          <DataStudioBreadcrumbs>
            <Link key="workspace-list" to={Urls.workspaces()}>
              {t`Workspaces`}
            </Link>
            {t`Development instances`}
          </DataStudioBreadcrumbs>
        }
        actions={hasInstances && <NewInstanceButton />}
        py={0}
      />
      {hasInstances ? (
        <Stack data-testid="workspace-instance-list" gap="lg">
          {instances.map((instance) => (
            <InstanceItem key={instance.id} instance={instance} />
          ))}
        </Stack>
      ) : (
        <InstanceEmptyState />
      )}
    </PageContainer>
  );
}
