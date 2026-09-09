import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import { useToast } from "metabase/common/hooks";
import { useLocation, useNavigate } from "metabase/router";
import * as Urls from "metabase/urls";
import { useDeleteWorktreeMutation } from "metabase-enterprise/api";
import type { Worktree } from "metabase-types/api";

import { isWithin } from "./utils";

/**
 * Deleting a worktree behind a confirmation. Render `deleteModal` alongside whatever control
 * calls `openDeleteModal`. Leaves the worktree's pages if the user is inside them, since they
 * no longer exist.
 */
export function useDeleteWorktree(worktree: Worktree) {
  const [isModalOpened, { open: openDeleteModal, close: closeDeleteModal }] =
    useDisclosure();
  const [deleteWorktree, { isLoading: isDeleting }] =
    useDeleteWorktreeMutation();
  const [sendToast] = useToast();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isInsideWorktree = isWithin(
    pathname,
    Urls.dataStudioWorktree(worktree.id),
  );

  const handleDelete = async () => {
    try {
      await deleteWorktree(worktree.id).unwrap();
      closeDeleteModal();
      if (isInsideWorktree) {
        navigate(Urls.transformList());
      }
    } catch {
      sendToast({
        message: t`Failed to delete worktree`,
        icon: "warning",
      });
    }
  };

  const deleteModal = (
    <ConfirmModal
      opened={isModalOpened}
      title={t`Delete the worktree for "${worktree.branch}"?`}
      message={t`All content checked out into this worktree will be deleted. The branch itself is not affected.`}
      confirmButtonText={t`Delete worktree`}
      confirmButtonProps={{ loading: isDeleting }}
      onConfirm={handleDelete}
      onClose={closeDeleteModal}
    />
  );

  return { openDeleteModal, deleteModal };
}
