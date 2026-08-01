import { useEffect } from "react";
import { t } from "ttag";

import { useToast } from "metabase/common/hooks";
import { useDispatch, useSelector } from "metabase/redux";

import { getCurrentTask } from "../selectors";
import { taskCleared } from "../sync-task-slice";

/**
 * A push that ends in conflict — it lost the preflight/execute race, or fell through a preflight
 * error — is otherwise silent, since the middleware has no way to toast. Surface it here, then
 * clear the task so it doesn't re-fire on re-render or navigation.
 */
export const useExportConflictToast = () => {
  const dispatch = useDispatch();
  const [sendToast] = useToast();
  const currentTask = useSelector(getCurrentTask);

  useEffect(() => {
    if (
      currentTask?.status === "conflict" &&
      currentTask?.sync_task_type === "export"
    ) {
      sendToast({
        icon: "warning",
        message: t`The remote branch changed before your push finished. Pull the latest changes, then push again.`,
      });
      dispatch(taskCleared());
    }
  }, [currentTask, dispatch, sendToast]);
};
