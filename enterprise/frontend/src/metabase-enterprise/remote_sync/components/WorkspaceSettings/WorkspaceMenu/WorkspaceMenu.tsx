import type { MouseEvent } from "react";
import { t } from "ttag";

import { getErrorMessage } from "metabase/api/utils";
import { useConfirmation } from "metabase/common/hooks/use-confirmation";
import { useToast } from "metabase/common/hooks/use-toast";
import { ActionIcon, Icon, Menu } from "metabase/ui";
import { useDeleteWorkspaceMutation } from "metabase-enterprise/api";
import type { Workspace } from "metabase-types/api";

type WorkspaceMenuProps = {
  workspace: Workspace;
};

export function WorkspaceMenu({ workspace }: WorkspaceMenuProps) {
  const [sendToast] = useToast();
  const { modalContent: confirmationModal, show: showConfirmation } =
    useConfirmation();
  const [deleteWorkspace] = useDeleteWorkspaceMutation();

  function handleIconClick(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
  }

  const handleDelete = () => {
    showConfirmation({
      title: t`Delete this workspace?`,
      message: t`Any users assigned to it will be unassigned.`,
      confirmButtonText: t`Delete`,
      confirmButtonProps: { color: "danger" },
      onConfirm: async () => {
        try {
          await deleteWorkspace(workspace.id).unwrap();
        } catch (err) {
          sendToast({
            icon: "warning",
            message: getErrorMessage(err, t`Failed to delete workspace`),
          });
        }
      },
    });
  };

  return (
    <>
      {confirmationModal}
      <Menu position="bottom-end">
        <Menu.Target>
          <ActionIcon
            aria-label={t`Workspace actions`}
            onClick={handleIconClick}
          >
            <Icon name="ellipsis" />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown onClick={(event) => event.stopPropagation()}>
          <Menu.Item
            c="danger"
            leftSection={<Icon name="trash" />}
            onClick={handleDelete}
          >
            {t`Delete`}
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </>
  );
}
