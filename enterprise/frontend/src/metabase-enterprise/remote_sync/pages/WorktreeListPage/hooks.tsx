import { type ReactNode, useState } from "react";
import { t } from "ttag";

import { getErrorMessage } from "metabase/api/utils";
import { useToast } from "metabase/common/hooks";
import { useSelector } from "metabase/redux";
import {
  useCheckoutWorktreeMutation,
  useImportChangesMutation,
} from "metabase-enterprise/api";
import type {
  RemoteSyncTaskId,
  RemoteSyncWorktreeId,
} from "metabase-types/api";

import { SyncTaskModal } from "../../components/SyncTaskModal";
import { getCurrentWorktreeId } from "../../selectors";

type WorktreeCheckout = {
  currentWorktreeId: RemoteSyncWorktreeId | null;
  checkout: (worktreeId: RemoteSyncWorktreeId) => Promise<void>;
  leave: () => Promise<void>;
  checkoutModal: ReactNode;
};

export function useWorktreeCheckout(): WorktreeCheckout {
  const currentWorktreeId = useSelector(getCurrentWorktreeId);
  const [checkoutWorktree] = useCheckoutWorktreeMutation();
  const [importChanges] = useImportChangesMutation();
  const [taskId, setTaskId] = useState<RemoteSyncTaskId | null>(null);
  const [sendToast] = useToast();

  const setWorktree = async (worktreeId: RemoteSyncWorktreeId | null) => {
    await checkoutWorktree({ worktree_id: worktreeId }).unwrap();
  };

  const checkout = async (worktreeId: RemoteSyncWorktreeId) => {
    try {
      await setWorktree(worktreeId);
      const { task_id } = await importChanges({ merge: true }).unwrap();
      if (task_id != null) {
        setTaskId(task_id);
      }
    } catch (error) {
      sendToast({
        message: getErrorMessage(error, t`Couldn't check out the worktree`),
        variant: "negative",
      });
    }
  };

  const leave = async () => {
    try {
      await setWorktree(null);
    } catch (error) {
      sendToast({
        message: getErrorMessage(error, t`Couldn't leave the worktree`),
        variant: "negative",
      });
    }
  };

  return {
    currentWorktreeId,
    checkout,
    leave,
    checkoutModal: (
      <SyncTaskModal
        title={t`Pulling changes`}
        taskId={taskId}
        onClose={() => setTaskId(null)}
      />
    ),
  };
}
