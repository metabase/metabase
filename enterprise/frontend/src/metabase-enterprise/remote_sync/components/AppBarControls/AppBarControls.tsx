import { useState } from "react";
import { t } from "ttag";

import { skipToken } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { useToast } from "metabase/common/hooks";
import { getUser } from "metabase/current-user";
import { useSelector } from "metabase/redux";
import { useSetting } from "metabase/settings";
import {
  useGetWorktreeQuery,
  useImportChangesMutation,
  useLazyGetRemoteSyncIsDirtyQuery,
} from "metabase-enterprise/api";

import { trackPullChanges } from "../../analytics";
import { getIsRemoteSyncVisible } from "../../selectors";
import { SyncTaskModal } from "../SyncTaskModal";

import { PullModal } from "./PullModal";
import { PushModal } from "./PushModal";
import { SyncMenu } from "./SyncMenu";
import type { SyncTask } from "./types";

type ControlsModal =
  | { type: "push" }
  | { type: "pull" }
  | { type: "task"; task: SyncTask };

export function AppBarControls() {
  const isVisible = useSelector(getIsRemoteSyncVisible);
  const worktreeId = useSelector(getUser)?.worktree_id;
  const settingBranch = useSetting("remote-sync-branch");
  const { data: worktree } = useGetWorktreeQuery(
    isVisible && worktreeId != null ? worktreeId : skipToken,
  );
  const branch = worktreeId != null ? worktree?.branch : settingBranch;

  if (!isVisible || !branch) {
    return null;
  }

  return <Controls branch={branch} />;
}

type ControlsProps = {
  branch: string;
};

function Controls({ branch }: ControlsProps) {
  const [modal, setModal] = useState<ControlsModal | null>(null);
  const [checkIsDirty] = useLazyGetRemoteSyncIsDirtyQuery();
  const [importChanges, { isLoading: isPulling }] = useImportChangesMutation();
  const [sendToast] = useToast();

  const handleTaskStarted = (task: SyncTask) =>
    setModal({ type: "task", task });
  const handleClose = () => setModal(null);

  const pull = async (keepChanges?: boolean) => {
    try {
      const { task_id } = await importChanges({
        branch,
        expected_branch: branch,
        ...(keepChanges != null && {
          merge: keepChanges,
          force: !keepChanges,
        }),
      }).unwrap();
      trackPullChanges({
        triggeredFrom: "app-bar",
        force: keepChanges === false,
      });
      if (task_id != null) {
        handleTaskStarted({ id: task_id, title: t`Pulling changes` });
      } else {
        handleClose();
      }
    } catch (error) {
      sendToast({
        message: getErrorMessage(error, t`Couldn't pull changes`),
        variant: "negative",
      });
    }
  };

  const handlePull = async () => {
    const { data, error } = await checkIsDirty();
    if (data?.is_dirty) {
      setModal({ type: "pull" });
    } else if (error) {
      sendToast({
        message: getErrorMessage(error, t`Couldn't pull changes`),
        variant: "negative",
      });
    } else {
      await pull();
    }
  };

  return (
    <>
      <SyncMenu
        branch={branch}
        onPull={handlePull}
        onPush={() => setModal({ type: "push" })}
      />
      <PushModal
        opened={modal?.type === "push"}
        branch={branch}
        onTaskStarted={handleTaskStarted}
        onClose={handleClose}
      />
      <PullModal
        opened={modal?.type === "pull"}
        isPulling={isPulling}
        onPull={pull}
        onClose={handleClose}
      />
      <SyncTaskModal
        title={modal?.type === "task" ? modal.task.title : ""}
        taskId={modal?.type === "task" ? modal.task.id : null}
        onClose={handleClose}
      />
    </>
  );
}
