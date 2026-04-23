import { push } from "react-router-redux";
import { t } from "ttag";

import { useConfirmation } from "metabase/common/hooks/use-confirmation";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { ActionIcon, Icon, Menu, Tooltip } from "metabase/ui";
import { TOOLTIP_OPEN_DELAY } from "metabase/utils/constants";
import { openSaveDialog } from "metabase/utils/dom";
import { useDispatch } from "metabase/utils/redux";
import * as Urls from "metabase/utils/urls";
import {
  useDeleteWorkspaceMutation,
  useLazyGetWorkspaceConfigYamlQuery,
} from "metabase-enterprise/api";
import type { Workspace } from "metabase-types/api";

import { isDatabaseProvisioned, isDatabaseUnprovisioned } from "../../utils";

type WorkspaceMoreMenuProps = {
  workspace: Workspace;
};

export function WorkspaceMoreMenu({ workspace }: WorkspaceMoreMenuProps) {
  const { modalContent, show } = useConfirmation();
  const [deleteWorkspace] = useDeleteWorkspaceMutation();
  const [fetchConfig] = useLazyGetWorkspaceConfigYamlQuery();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();
  const dispatch = useDispatch();
  const isFullyProvisioned = workspace.databases.every(isDatabaseProvisioned);
  const isFullyUnprovisioned = workspace.databases.every(
    isDatabaseUnprovisioned,
  );

  const handleDownload = async () => {
    const { data, error } = await fetchConfig(workspace.id);
    if (error || data == null) {
      sendErrorToast(t`Failed to download configuration file`);
      return;
    }
    const blob = new Blob([data], { type: "application/yaml" });
    openSaveDialog("config.yml", blob);
  };

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
            label={t`Provision this workspace before downloading the configuration file.`}
            disabled={isFullyProvisioned}
            openDelay={TOOLTIP_OPEN_DELAY}
          >
            <Menu.Item
              leftSection={<Icon name="download" />}
              disabled={!isFullyProvisioned}
              onClick={handleDownload}
            >
              {t`Download config file`}
            </Menu.Item>
          </Tooltip>
          <Tooltip
            label={t`Unprovision this workspace before deleting.`}
            disabled={isFullyUnprovisioned}
            openDelay={TOOLTIP_OPEN_DELAY}
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
      {modalContent}
    </>
  );
}
