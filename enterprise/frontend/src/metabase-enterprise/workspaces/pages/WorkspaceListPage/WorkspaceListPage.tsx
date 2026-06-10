import { t } from "ttag";

import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { DataStudioBreadcrumbs } from "metabase/data-studio/common/components/DataStudioBreadcrumbs";
import { PageContainer } from "metabase/data-studio/common/components/PageContainer";
import { PaneHeader } from "metabase/data-studio/common/components/PaneHeader";
import { useListWorkspacesQuery } from "metabase-enterprise/api";
import type { Workspace } from "metabase-types/api";

import { WorkspaceSection } from "./WorkspaceSection/WorkspaceSection";

export function WorkspaceListPage() {
  const { data: workspaces, isLoading, error } = useListWorkspacesQuery();

  if (isLoading || error != null || workspaces == null) {
    return <DelayedLoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return <WorkspaceListPageBody workspaces={workspaces} />;
}

type WorkspaceListPageBodyProps = {
  workspaces: Workspace[];
};

function WorkspaceListPageBody({ workspaces }: WorkspaceListPageBodyProps) {
  return (
    <PageContainer data-testid="workspace-list-page">
      <PaneHeader
        breadcrumbs={
          <DataStudioBreadcrumbs>{t`Workspaces`}</DataStudioBreadcrumbs>
        }
        py={0}
      />
      <WorkspaceSection workspaces={workspaces} />
    </PageContainer>
  );
}
