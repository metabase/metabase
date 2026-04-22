import { useState } from "react";
import { Link, type Route } from "react-router";
import { push } from "react-router-redux";
import { t } from "ttag";

import { LeaveRouteConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import { DataStudioBreadcrumbs } from "metabase/data-studio/common/components/DataStudioBreadcrumbs";
import { PageContainer } from "metabase/data-studio/common/components/PageContainer";
import {
  PaneHeader,
  PaneHeaderActions,
  PaneHeaderInput,
} from "metabase/data-studio/common/components/PaneHeader";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Stack } from "metabase/ui";
import { useDispatch } from "metabase/utils/redux";
import * as Urls from "metabase/utils/urls";
import { useCreateWorkspaceMutation } from "metabase-enterprise/api";
import type { WorkspaceDatabaseMapping } from "metabase-types/api";

import { DatabaseMappingSection } from "../../components/DatabaseMappingSection";

type NewWorkspacePageProps = {
  route: Route;
};

export function NewWorkspacePage({ route }: NewWorkspacePageProps) {
  const [createWorkspace, { isLoading: isSaving }] =
    useCreateWorkspaceMutation();
  const dispatch = useDispatch();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();

  const [name, setName] = useState(t`New workspace`);
  const [databases, setDatabases] = useState<WorkspaceDatabaseMapping[]>([]);
  const [isDirty, setIsDirty] = useState(false);

  const handleNameChange = (value: string) => {
    setName(value);
    setIsDirty(true);
  };

  const handleDatabasesChange = (value: WorkspaceDatabaseMapping[]) => {
    setDatabases(value);
    setIsDirty(true);
  };

  const handleCancel = () => {
    dispatch(push(Urls.workspaceList()));
  };

  const handleSave = async () => {
    const { data: workspace, error } = await createWorkspace({
      name,
      databases,
    });

    if (error || workspace == null) {
      sendErrorToast(t`Failed to create workspace`);
      return;
    }

    sendSuccessToast(t`Workspace created`);
    setIsDirty(false);
    dispatch(push(Urls.workspace(workspace.id)));
  };

  return (
    <>
      <PageContainer data-testid="new-workspace-page" gap="2.5rem">
        <PaneHeader
          py={0}
          breadcrumbs={
            <DataStudioBreadcrumbs>
              <Link key="workspace-list" to={Urls.workspaceList()}>
                {t`Workspaces`}
              </Link>
              {t`New workspace`}
            </DataStudioBreadcrumbs>
          }
          title={
            <PaneHeaderInput
              initialValue={name}
              placeholder={t`New workspace`}
              onChange={handleNameChange}
            />
          }
          actions={
            <PaneHeaderActions
              isDirty
              isSaving={isSaving}
              onSave={handleSave}
              onCancel={handleCancel}
            />
          }
          showMetabotButton
        />
        <Stack gap="3.5rem">
          <DatabaseMappingSection
            mappings={databases}
            onChange={handleDatabasesChange}
          />
        </Stack>
      </PageContainer>
      <LeaveRouteConfirmModal route={route} isEnabled={isDirty && !isSaving} />
    </>
  );
}
