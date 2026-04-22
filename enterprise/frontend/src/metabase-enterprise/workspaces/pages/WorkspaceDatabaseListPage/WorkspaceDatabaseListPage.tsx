import { useMemo, useState } from "react";
import type { Route } from "react-router";
import { t } from "ttag";
import _ from "underscore";

import { skipToken } from "metabase/api";
import { LeaveRouteConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PageContainer } from "metabase/data-studio/common/components/PageContainer";
import { PaneHeaderActions } from "metabase/data-studio/common/components/PaneHeader";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Center, Stack } from "metabase/ui";
import * as Urls from "metabase/utils/urls";
import {
  useGetWorkspaceQuery,
  useUpdateWorkspaceMutation,
} from "metabase-enterprise/api";
import type { Workspace, WorkspaceDatabaseDraft } from "metabase-types/api";

import { DatabaseMappingSection } from "../../components/DatabaseMappingSection";
import { WorkspaceHeader } from "../../components/WorkspaceHeader";

type WorkspaceDatabaseListPageParams = {
  workspaceId: string;
};

type WorkspaceDatabaseListPageProps = {
  params: WorkspaceDatabaseListPageParams;
  route: Route;
};

export function WorkspaceDatabaseListPage({
  params,
  route,
}: WorkspaceDatabaseListPageProps) {
  const workspaceId = Urls.extractEntityId(params.workspaceId);
  const {
    data: workspace,
    isLoading,
    error,
  } = useGetWorkspaceQuery(workspaceId ?? skipToken);

  if (isLoading || error != null || workspace == null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return <WorkspaceDatabaseListPageBody workspace={workspace} route={route} />;
}

type WorkspaceDatabaseListPageBodyProps = {
  workspace: Workspace;
  route: Route;
};

function WorkspaceDatabaseListPageBody({
  workspace,
  route,
}: WorkspaceDatabaseListPageBodyProps) {
  const [databases, setDatabases] = useState<WorkspaceDatabaseDraft[]>(
    workspace.databases,
  );
  const [updateWorkspace, { isLoading: isSaving }] =
    useUpdateWorkspaceMutation();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();

  const isDirty = useMemo(
    () => !_.isEqual(databases, workspace.databases),
    [databases, workspace.databases],
  );

  const handleCancel = () => {
    setDatabases(workspace.databases);
  };

  const handleSave = async () => {
    const { error } = await updateWorkspace({
      id: workspace.id,
      databases,
    });
    if (error) {
      sendErrorToast(t`Failed to update workspace`);
    } else {
      sendSuccessToast(t`Workspace updated`);
    }
  };

  return (
    <>
      <PageContainer data-testid="workspace-database-list-page" gap="2.5rem">
        <WorkspaceHeader
          workspace={workspace}
          actions={
            <PaneHeaderActions
              isDirty={isDirty}
              isSaving={isSaving}
              onSave={handleSave}
              onCancel={handleCancel}
            />
          }
        />
        <Stack gap="3.5rem">
          <DatabaseMappingSection
            mappings={databases}
            onChange={setDatabases}
          />
        </Stack>
      </PageContainer>
      <LeaveRouteConfirmModal route={route} isEnabled={isDirty && !isSaving} />
    </>
  );
}
