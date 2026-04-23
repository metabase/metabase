import { useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useConfirmation } from "metabase/common/hooks/use-confirmation";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { ActionIcon, Icon, Menu, Tooltip } from "metabase/ui";
import { useDispatch } from "metabase/utils/redux";
import * as Urls from "metabase/utils/urls";
import { useDeleteWorkspaceMutation } from "metabase-enterprise/api";
import type { Workspace } from "metabase-types/api";

import { isDatabaseUnprovisioned } from "../../../utils";

import { WorkspaceConfigModal } from "./WorkspaceConfigModal";

type WorkspaceMoreMenuProps = {
  workspace: Workspace;
};

export function WorkspaceMoreMenu({ workspace }: WorkspaceMoreMenuProps) {
  const [isConfigOpened, setIsConfigOpened] = useState(false);
  const { modalContent, show } = useConfirmation();
  const [deleteWorkspace] = useDeleteWorkspaceMutation();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();
  const dispatch = useDispatch();
  const isFullyUnprovisioned = workspace.databases.every(
    isDatabaseUnprovisioned,
  );

  const handleDelete = () => {
    show({
      title: t`Delete this workspace?`,
      message: t`This cannot be undone.`,
      confirmButtonText: t`Delete workspace`,
      confirmButtonProps: { variant: "filled", color: "error" },
      onConfirm: async () => {
        const { error } = await deleteWorkspace(workspace.id);
        if (error) {
          sendErrorToast(t`Failed to delete workspace`);
          return;
        }
        sendSuccessToast(t`Workspace deleted`);
        dispatch(push(Urls.workspaceList()));
      },
    });
  };

  return (
    <>
      <Menu>
        <Menu.Target>
          <ActionIcon size="sm">
            <Icon name="ellipsis" />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item
            leftSection={<Icon name="code_block" />}
            onClick={() => setIsConfigOpened(true)}
          >
            {t`Configuration file`}
          </Menu.Item>
          <Tooltip
            label={t`Unprovision this workspace before deleting.`}
            disabled={isFullyUnprovisioned}
          >
            <Menu.Item
              leftSection={<Icon name="trash" />}
              disabled={!isFullyUnprovisioned}
              onClick={handleDelete}
            >
              {t`Delete`}
            </Menu.Item>
          </Tooltip>
        </Menu.Dropdown>
      </Menu>
      <WorkspaceConfigModal
        workspace={workspace}
        opened={isConfigOpened}
        onClose={() => setIsConfigOpened(false)}
      />
      {modalContent}
    </>
  );
}
