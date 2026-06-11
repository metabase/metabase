import { t } from "ttag";

import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { DataStudioBreadcrumbs } from "metabase/data-studio/common/components/DataStudioBreadcrumbs";
import { PageContainer } from "metabase/data-studio/common/components/PageContainer";
import { PaneHeader } from "metabase/data-studio/common/components/PaneHeader";
import { Group, Stack, Title } from "metabase/ui";
import { useListWorkspacesQuery } from "metabase-enterprise/api";
import type { Workspace } from "metabase-types/api";

import { NewWorkspaceButton } from "./NewWorkspaceButton";
import { WorkspaceEmptyState } from "./WorkspaceEmptyState";
import { WorkspaceItem } from "./WorkspaceItem";

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
  const hasWorkspaces = workspaces.length > 0;

  return (
    <PageContainer data-testid="workspace-list-page">
      <PaneHeader
        breadcrumbs={
          <DataStudioBreadcrumbs>{t`Workspaces`}</DataStudioBreadcrumbs>
        }
        py={0}
      />
      {hasWorkspaces ? (
        <WorkspaceSection workspaces={workspaces} />
      ) : (
        <WorkspaceEmptyState />
      )}
    </PageContainer>
  );
}

type WorkspaceSectionProps = {
  workspaces: Workspace[];
};

function WorkspaceSection({ workspaces }: WorkspaceSectionProps) {
  return (
    <Stack data-testid="workspace-list" gap="lg">
      <Group justify="space-between">
        <Title order={4}>{t`Active workspaces`}</Title>
        <NewWorkspaceButton />
      </Group>
      {workspaces.map((workspace) => (
        <WorkspaceItem key={workspace.id} workspace={workspace} />
      ))}
    </Stack>
  );
}
