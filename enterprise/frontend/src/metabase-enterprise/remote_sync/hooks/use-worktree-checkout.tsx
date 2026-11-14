import { type ReactNode, useState } from "react";
import { t } from "ttag";

import { useUpdateUserMutation } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { useToast } from "metabase/common/hooks";
import { getUser } from "metabase/current-user";
import { useSelector } from "metabase/redux";
import { useImportChangesMutation } from "metabase-enterprise/api";
import type { RemoteSyncTaskId, WorktreeId } from "metabase-types/api";

import { SyncTaskModal } from "../components/SyncTaskModal";

type WorktreeCheckout = {
  currentWorktreeId: WorktreeId | null;
  checkout: (worktreeId: WorktreeId) => Promise<void>;
  leave: () => Promise<void>;
  modal: ReactNode;
};

function reloadPage() {
  window.location.reload();
}

export function useWorktreeCheckout(): WorktreeCheckout {
  const user = useSelector(getUser);
  const [updateUser] = useUpdateUserMutation();
  const [importChanges] = useImportChangesMutation();
  const [taskId, setTaskId] = useState<RemoteSyncTaskId | null>(null);
  const [sendToast] = useToast();

  const checkout = async (worktreeId: WorktreeId) => {
    if (user == null) {
      return;
    }
    try {
      await updateUser({ id: user.id, worktree_id: worktreeId }).unwrap();
      const { task_id } = await importChanges({ merge: true }).unwrap();
      if (task_id != null) {
        setTaskId(task_id);
      } else {
        reloadPage();
      }
    } catch (error) {
      sendToast({
        message: getErrorMessage(error, t`Couldn't check out the worktree`),
        variant: "negative",
      });
    }
  };

  const leave = async () => {
    if (user == null) {
      return;
    }
    try {
      await updateUser({ id: user.id, worktree_id: null }).unwrap();
      reloadPage();
    } catch (error) {
      sendToast({
        message: getErrorMessage(error, t`Couldn't leave the worktree`),
        variant: "negative",
      });
    }
  };

  return {
    currentWorktreeId: user?.worktree_id ?? null,
    checkout,
    leave,
    modal: (
      <SyncTaskModal
        title={t`Pulling changes`}
        taskId={taskId}
        onClose={reloadPage}
      />
    ),
  };
}
