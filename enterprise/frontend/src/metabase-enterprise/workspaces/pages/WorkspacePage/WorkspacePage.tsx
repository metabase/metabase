import { useMemo, useState } from "react";
import { Link, type Route } from "react-router";
import { t } from "ttag";
import _ from "underscore";

import { skipToken } from "metabase/api";
import { LeaveRouteConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { DataStudioBreadcrumbs } from "metabase/data-studio/common/components/DataStudioBreadcrumbs";
import { PageContainer } from "metabase/data-studio/common/components/PageContainer";
import {
  PaneHeader,
  PaneHeaderActions,
  PaneHeaderInput,
  PaneHeaderTabs,
} from "metabase/data-studio/common/components/PaneHeader";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Center, Stack } from "metabase/ui";
import * as Urls from "metabase/utils/urls";
import {
  useGetWorkspaceQuery,
  useUpdateWorkspaceMutation,
} from "metabase-enterprise/api";
import type { Workspace } from "metabase-types/api";

import { DatabaseMappingSection } from "../../components/DatabaseMappingSection";
import { WorkspaceMoreMenu } from "../../components/WorkspaceMoreMenu";

type WorkspacePageParams = {
  workspaceId: string;
};

type WorkspacePageProps = {
  params: WorkspacePageParams;
  route: Route;
};

export function WorkspacePage({ params, route }: WorkspacePageProps) {
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

  return <WorkspacePageBody workspace={workspace} route={route} />;
}

type WorkspacePageBodyProps = {
  workspace: Workspace;
  route: Route;
};

function WorkspacePageBody({ workspace, route }: WorkspacePageBodyProps) {
  const [updateWorkspace, { isLoading: isSaving }] =
    useUpdateWorkspaceMutation();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();

  const [databases, setDatabases] = useState(workspace.databases);

  const isDirty = useMemo(
    () => !_.isEqual(databases, workspace.databases),
    [databases, workspace.databases],
  );

  const handleNameChange = async (name: string) => {
    const { error } = await updateWorkspace({ id: workspace.id, name });
    if (error) {
      sendErrorToast(t`Failed to update workspace name`);
    } else {
      sendSuccessToast(t`Workspace name updated`);
    }
  };

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
      <PageContainer data-testid="workspace-page" gap="2.5rem">
        <PaneHeader
          py={0}
          breadcrumbs={
            <DataStudioBreadcrumbs>
              <Link key="workspace-list" to={Urls.workspaceList()}>
                {t`Workspaces`}
              </Link>
              {workspace.name}
            </DataStudioBreadcrumbs>
          }
          title={
            <PaneHeaderInput
              initialValue={workspace.name}
              onChange={handleNameChange}
            />
          }
          menu={<WorkspaceMoreMenu workspace={workspace} />}
          tabs={
            <PaneHeaderTabs
              tabs={[
                {
                  label: t`Settings`,
                  to: Urls.workspace(workspace.id),
                },
              ]}
            />
          }
          actions={
            <PaneHeaderActions
              isDirty={isDirty}
              isSaving={isSaving}
              onSave={handleSave}
              onCancel={handleCancel}
            />
          }
          showMetabotButton
        />
        <Stack gap="3.5rem">
          <DatabaseMappingSection
            mappings={workspace.databases}
            onChange={setDatabases}
          />
        </Stack>
      </PageContainer>
      <LeaveRouteConfirmModal route={route} isEnabled={isDirty && !isSaving} />
    </>
  );
}
