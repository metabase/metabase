import type { ReactNode } from "react";
import { Link } from "react-router";
import { push } from "react-router-redux";
import { t } from "ttag";

import { DataStudioBreadcrumbs } from "metabase/data-studio/common/components/DataStudioBreadcrumbs";
import {
  PaneHeader,
  PaneHeaderInput,
} from "metabase/data-studio/common/components/PaneHeader";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { useDispatch } from "metabase/redux";
import { ActionIcon, Icon, Menu } from "metabase/ui";
import * as Urls from "metabase/urls";
import { useUpdateWorkspaceMutation } from "metabase-enterprise/api";
import type { Workspace } from "metabase-types/api";

import { useDeleteWorkspace } from "../../../hooks";

export type WorkspaceHeaderProps = {
  workspace: Workspace;
  actions?: ReactNode;
};

export function WorkspaceHeader({ workspace, actions }: WorkspaceHeaderProps) {
  const [updateWorkspace] = useUpdateWorkspaceMutation();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();

  const handleNameChange = async (newName: string) => {
    const { error } = await updateWorkspace({
      id: workspace.id,
      name: newName,
    });
    if (error) {
      sendErrorToast(t`Failed to update workspace name`);
    } else {
      sendSuccessToast(t`Workspace name updated`);
    }
  };

  return (
    <PaneHeader
      title={
        <PaneHeaderInput
          initialValue={workspace.name}
          onChange={handleNameChange}
        />
      }
      breadcrumbs={
        <DataStudioBreadcrumbs>
          <Link key="workspace-list" to={Urls.workspaceList()}>
            {t`Workspaces`}
          </Link>
          {workspace.name}
        </DataStudioBreadcrumbs>
      }
      menu={<WorkspaceHeaderMenu workspace={workspace} />}
      actions={actions}
      py={0}
    />
  );
}

type WorkspaceHeaderMenuProps = {
  workspace: Workspace;
};

function WorkspaceHeaderMenu({ workspace }: WorkspaceHeaderMenuProps) {
  const dispatch = useDispatch();
  const { handleDelete, modalContent } = useDeleteWorkspace({
    onSuccess: () => dispatch(push(Urls.workspaceList())),
  });

  return (
    <>
      <Menu>
        <Menu.Target>
          <ActionIcon size="sm" aria-label={t`Workspace actions`}>
            <Icon name="ellipsis" />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item
            leftSection={<Icon name="trash" />}
            onClick={() => handleDelete(workspace)}
          >
            {t`Delete`}
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
      {modalContent}
    </>
  );
}
