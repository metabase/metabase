import { useDisclosure } from "@mantine/hooks";
import { useCallback } from "react";
import { t } from "ttag";

import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import { trackContentStudioWorktreeDeleted } from "metabase/common/content-studio/analytics";
import { useToast } from "metabase/common/hooks";
import { useSelector } from "metabase/redux";
import { ActionIcon, Icon, Menu } from "metabase/ui";
import { useDeleteWorktreeMutation } from "metabase-enterprise/api";
import { getIsRunning } from "metabase-enterprise/remote_sync/selectors";
import { parseSyncError } from "metabase-enterprise/remote_sync/utils";
import type { RemoteSyncWorktree } from "metabase-types/api";

import { useContentStudioScope } from "../../scope";

export type BranchMenuProps = {
  worktree: RemoteSyncWorktree;
};

/**
 * Actions on the branch the studio is scoped to. Pull and push are not here: they live in the
 * sidebar's sync controls, which own the preflight and conflict flow around them. Creating
 * content belongs to the sidebar sections, each of which creates in its own namespace.
 */
export function BranchMenu({ worktree }: BranchMenuProps) {
  const { setScope } = useContentStudioScope();
  const isSyncRunning = useSelector(getIsRunning);
  const [sendToast] = useToast();
  const [deleteWorktree] = useDeleteWorktreeMutation();
  const [
    isDeleteModalOpen,
    { open: openDeleteModal, close: closeDeleteModal },
  ] = useDisclosure(false);

  const handleDelete = useCallback(async () => {
    try {
      await deleteWorktree(worktree.id).unwrap();
      trackContentStudioWorktreeDeleted(worktree.id);
      closeDeleteModal();
      setScope(null);
      sendToast({ message: t`Deleted the "${worktree.branch}" checkout` });
    } catch (error) {
      const { errorMessage } = parseSyncError(error);
      sendToast({
        message: errorMessage || t`Failed to delete the checkout`,
        icon: "warning",
      });
    }
  }, [closeDeleteModal, deleteWorktree, sendToast, setScope, worktree]);

  return (
    <>
      <Menu position="bottom-end">
        <Menu.Target>
          <ActionIcon aria-label={t`Branch options`} color="text-secondary">
            <Icon name="ellipsis" />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item
            c="danger"
            leftSection={<Icon name="trash" />}
            disabled={isSyncRunning}
            onClick={openDeleteModal}
          >
            {t`Delete checkout`}
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>

      <ConfirmModal
        opened={isDeleteModalOpen}
        title={t`Delete the "${worktree.branch}" checkout?`}
        message={t`Everything checked out from the "${worktree.branch}" branch will be deleted from this instance. The branch itself won't be touched.`}
        confirmButtonText={t`Delete checkout`}
        onConfirm={handleDelete}
        onClose={closeDeleteModal}
      />
    </>
  );
}
