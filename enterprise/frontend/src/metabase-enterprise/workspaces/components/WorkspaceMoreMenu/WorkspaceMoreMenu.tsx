import { push } from "react-router-redux";
import { t } from "ttag";

import { useConfirmation } from "metabase/common/hooks/use-confirmation";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { useDispatch } from "metabase/redux";
import { ActionIcon, Icon, Menu, Tooltip } from "metabase/ui";
import { TOOLTIP_OPEN_DELAY } from "metabase/utils/constants";
import * as Urls from "metabase/utils/urls";
import { useDeleteWorkspaceMutation } from "metabase-enterprise/api";
import type { Workspace } from "metabase-types/api";

import { isDatabaseUnprovisioned } from "../../utils";

type WorkspaceMoreMenuProps = {
  workspace: Workspace;
};

export function WorkspaceMoreMenu({ workspace }: WorkspaceMoreMenuProps) {
  const dispatch = useDispatch();
  const [deleteWorkspace] = useDeleteWorkspaceMutation();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();
  const { modalContent, show } = useConfirmation();
  const isUnprovisioned = workspace.databases.every(isDatabaseUnprovisioned);

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
          <Tooltip
            label={t`Unprovision the workspace before deleting it.`}
            disabled={isUnprovisioned}
            openDelay={TOOLTIP_OPEN_DELAY}
          >
            <Menu.Item
              leftSection={<Icon name="trash" />}
              disabled={!isUnprovisioned}
              onClick={handleDelete}
            >
              {t`Delete`}
            </Menu.Item>
          </Tooltip>
        </Menu.Dropdown>
      </Menu>
      {modalContent}
    </>
  );
}
