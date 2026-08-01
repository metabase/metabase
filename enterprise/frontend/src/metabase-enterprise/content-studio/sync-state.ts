import { useSelector } from "metabase/redux";
import {
  getIsRunning,
  getSyncTaskWorktreeId,
  getTaskType,
} from "metabase-enterprise/remote_sync/selectors";

import { useContentStudioScope } from "./scope";

/**
 * Whether the branch the studio is showing is having its content pulled in —
 * true while a freshly checked-out branch is being materialized. A push leaves
 * the content in place, so it doesn't count.
 */
export function useIsScopeImporting(): boolean {
  const { worktreeId } = useContentStudioScope();
  const isRunning = useSelector(getIsRunning);
  const taskType = useSelector(getTaskType);
  const syncingWorktreeId = useSelector(getSyncTaskWorktreeId);

  return isRunning && taskType === "import" && syncingWorktreeId === worktreeId;
}
