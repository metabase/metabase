import { useState } from "react";
import { t } from "ttag";

import { getErrorMessage } from "metabase/api/utils";
import { useToast } from "metabase/common/hooks";
import { useSelector } from "metabase/redux";
import { useSetting } from "metabase/settings";
import { Group } from "metabase/ui";
import {
  useImportChangesMutation,
  useLazyGetRemoteSyncIsDirtyQuery,
} from "metabase-enterprise/api";

import { trackBranchSwitched, trackPullChanges } from "../../analytics";
import { getIsRemoteSyncVisible } from "../../selectors";
import { SyncTaskModal } from "../SyncTaskModal";

import { BranchSelect } from "./BranchSelect";
import { NewBranchModal } from "./NewBranchModal";
import { PullModal } from "./PullModal";
import { PushModal } from "./PushModal";
import { SyncMenu } from "./SyncMenu";
import type { SyncTask } from "./types";

type ControlsModal =
  | { type: "push" }
  | { type: "pull"; targetBranch: string }
  | { type: "new-branch" }
  | { type: "task"; task: SyncTask };

export const AppBarControls = () => {
  const isVisible = useSelector(getIsRemoteSyncVisible);
  const branch = useSetting("remote-sync-branch");

  if (!isVisible || !branch) {
    return null;
  }

  return <Controls branch={branch} />;
};

type ControlsProps = {
  branch: string;
};

const Controls = ({ branch }: ControlsProps) => {
  const [modal, setModal] = useState<ControlsModal | null>(null);
  const [checkIsDirty] = useLazyGetRemoteSyncIsDirtyQuery();
  const [importChanges, { isLoading: isPulling }] = useImportChangesMutation();
  const [sendToast] = useToast();

  const handleTaskStarted = (task: SyncTask) =>
    setModal({ type: "task", task });
  const handleClose = () => setModal(null);

  const pull = async (targetBranch: string, keepChanges?: boolean) => {
    try {
      const { task_id } = await importChanges({
        branch: targetBranch,
        expected_branch: branch,
        ...(keepChanges != null && {
          merge: keepChanges,
          force: !keepChanges,
        }),
      }).unwrap();
      if (targetBranch === branch) {
        trackPullChanges({
          triggeredFrom: "app-bar",
          force: keepChanges === false,
        });
      } else {
        trackBranchSwitched({ triggeredFrom: "app-bar" });
      }
      if (task_id != null) {
        handleTaskStarted({
          id: task_id,
          title:
            targetBranch === branch
              ? t`Pulling changes`
              : t`Switching to ${targetBranch}`,
        });
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

  const handlePull = async (targetBranch: string) => {
    const { data, error } = await checkIsDirty();
    if (data?.is_dirty) {
      setModal({ type: "pull", targetBranch });
    } else if (error) {
      sendToast({
        message: getErrorMessage(error, t`Couldn't pull changes`),
        variant: "negative",
      });
    } else {
      await pull(targetBranch);
    }
  };

  const pullTargetBranch = modal?.type === "pull" ? modal.targetBranch : branch;

  return (
    <Group data-testid="git-sync-controls" gap="sm" wrap="nowrap">
      <BranchSelect branch={branch} onChange={handlePull} />
      <SyncMenu
        onPull={() => handlePull(branch)}
        onPush={() => setModal({ type: "push" })}
        onPushToNewBranch={() => setModal({ type: "new-branch" })}
      />
      <PushModal
        opened={modal?.type === "push"}
        branch={branch}
        onTaskStarted={handleTaskStarted}
        onClose={handleClose}
      />
      <PullModal
        opened={modal?.type === "pull"}
        branch={branch}
        targetBranch={pullTargetBranch}
        isPulling={isPulling}
        onPull={(keepChanges) => pull(pullTargetBranch, keepChanges)}
        onClose={handleClose}
      />
      <NewBranchModal
        opened={modal?.type === "new-branch"}
        onTaskStarted={handleTaskStarted}
        onClose={handleClose}
      />
      <SyncTaskModal
        title={modal?.type === "task" ? modal.task.title : ""}
        taskId={modal?.type === "task" ? modal.task.id : null}
        onClose={handleClose}
      />
    </Group>
  );
};
