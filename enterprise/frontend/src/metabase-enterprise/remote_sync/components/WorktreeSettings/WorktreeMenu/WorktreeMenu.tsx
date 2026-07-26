import type { MouseEvent } from "react";
import { t } from "ttag";

import { useUpdateUserMutation } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { useConfirmation } from "metabase/common/hooks/use-confirmation";
import { useToast } from "metabase/common/hooks/use-toast";
import { useSelector } from "metabase/redux";
import { getUser } from "metabase/selectors/user";
import { ActionIcon, Icon, Menu } from "metabase/ui";
import { useDeleteWorktreeMutation } from "metabase-enterprise/api";
import type { RemoteSyncWorktree } from "metabase-types/api";

type WorktreeMenuProps = {
  worktree: RemoteSyncWorktree;
};

export function WorktreeMenu({ worktree }: WorktreeMenuProps) {
  const [sendToast] = useToast();
  const currentUser = useSelector(getUser);
  const { modalContent: confirmationModal, show: showConfirmation } =
    useConfirmation();
  const [updateUser] = useUpdateUserMutation();
  const [deleteWorktree] = useDeleteWorktreeMutation();

  const isCurrentUserMember = currentUser?.worktree_id === worktree.id;

  function handleIconClick(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
  }

  const handleToggleMembership = async () => {
    if (!currentUser) {
      return;
    }
    try {
      await updateUser({
        id: currentUser.id,
        worktree_id: isCurrentUserMember ? null : worktree.id,
      }).unwrap();
    } catch (err) {
      sendToast({
        icon: "warning",
        message: getErrorMessage(
          err,
          isCurrentUserMember
            ? t`Failed to leave worktree`
            : t`Failed to enter worktree`,
        ),
      });
    }
  };

  const handleDelete = () => {
    showConfirmation({
      title: t`Delete this worktree?`,
      message: t`Any users assigned to it will be unassigned.`,
      confirmButtonText: t`Delete`,
      confirmButtonProps: { color: "danger" },
      onConfirm: async () => {
        try {
          await deleteWorktree(worktree.id).unwrap();
        } catch (err) {
          sendToast({
            icon: "warning",
            message: getErrorMessage(err, t`Failed to delete worktree`),
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
            aria-label={t`Worktree actions`}
            onClick={handleIconClick}
          >
            <Icon name="ellipsis" />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown onClick={(event) => event.stopPropagation()}>
          <Menu.Item
            leftSection={
              <Icon name={isCurrentUserMember ? "exit" : "arrow_right"} />
            }
            onClick={handleToggleMembership}
          >
            {isCurrentUserMember ? t`Leave worktree` : t`Enter worktree`}
          </Menu.Item>
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
