import { type ReactNode, useState } from "react";
import { t } from "ttag";

import { useUpdateUserMutation } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { useToast } from "metabase/common/hooks";
import { getUser } from "metabase/current-user";
import { useDispatch, useSelector } from "metabase/redux";
import {
  EnterpriseApi,
  useImportChangesMutation,
} from "metabase-enterprise/api";
import { listTag, tag } from "metabase-enterprise/api/tags";
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
  modal: ReactNode;
};

const REMOTE_SYNC_STATE_TAGS = [
  tag("remote-sync-changes"),
  tag("remote-sync-current-task"),
  tag("remote-sync-remote-changes"),
  listTag("remote-sync-worktree"),
];

export function useWorktreeCheckout(): WorktreeCheckout {
  const dispatch = useDispatch();
  const user = useSelector(getUser);
  const currentWorktreeId = useSelector(getCurrentWorktreeId);
  const [updateUser] = useUpdateUserMutation();
  const [importChanges] = useImportChangesMutation();
  const [taskId, setTaskId] = useState<RemoteSyncTaskId | null>(null);
  const [sendToast] = useToast();

  const setWorktree = async (worktreeId: RemoteSyncWorktreeId | null) => {
    if (user == null) {
      return;
    }
    await updateUser({ id: user.id, worktree_id: worktreeId }).unwrap();
    dispatch(EnterpriseApi.util.invalidateTags(REMOTE_SYNC_STATE_TAGS));
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
    modal: (
      <SyncTaskModal
        title={t`Pulling changes`}
        taskId={taskId}
        onClose={() => setTaskId(null)}
      />
    ),
  };
}
