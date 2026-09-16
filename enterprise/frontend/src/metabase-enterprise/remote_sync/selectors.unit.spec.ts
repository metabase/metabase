import { createMockState } from "__support__/state";
import type { RemoteSyncTask } from "metabase-types/api";

import { getInitiatedByUser, getIsCancelled, getStartedAt } from "./selectors";
import { initialState } from "./sync-task-slice";
import type { RemoteSyncStoreState } from "./types";

const task: RemoteSyncTask = {
  id: 2080,
  sync_task_type: "import",
  status: "cancelled",
  progress: 0.21,
  started_at: "2026-09-15T22:06:23Z",
  ended_at: "2026-09-15T22:40:00Z",
  last_progress_report_at: "2026-09-15T22:08:39Z",
  error_message: "Task cancelled",
  initiated_by: 231,
  initiated_by_user: {
    id: 231,
    first_name: "Cynthia",
    last_name: "Balusek",
    email: "cynthia@example.com",
  },
};

const stateWith = (
  currentTask: RemoteSyncTask | null,
): RemoteSyncStoreState => ({
  ...createMockState(),
  plugins: { remoteSyncPlugin: { ...initialState, currentTask } },
});

describe("remote_sync selectors", () => {
  it("getIsCancelled is true only for a cancelled task", () => {
    expect(getIsCancelled(stateWith(task))).toBe(true);
    expect(getIsCancelled(stateWith({ ...task, status: "timed-out" }))).toBe(
      false,
    );
    expect(getIsCancelled(stateWith(null))).toBe(false);
  });

  it("getStartedAt returns the start time or null", () => {
    expect(getStartedAt(stateWith(task))).toBe("2026-09-15T22:06:23Z");
    expect(getStartedAt(stateWith(null))).toBeNull();
  });

  it("getInitiatedByUser returns the trimmed user, or null when the task has none", () => {
    expect(getInitiatedByUser(stateWith(task))).toEqual(task.initiated_by_user);
    expect(
      getInitiatedByUser(stateWith({ ...task, initiated_by_user: null })),
    ).toBeNull();
    expect(
      getInitiatedByUser(stateWith({ ...task, initiated_by_user: undefined })),
    ).toBeNull();
    expect(getInitiatedByUser(stateWith(null))).toBeNull();
  });
});
