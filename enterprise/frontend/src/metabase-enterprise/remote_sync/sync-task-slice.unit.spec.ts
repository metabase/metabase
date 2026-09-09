import { createMockRemoteSyncTask } from "metabase-types/api/mocks";

import {
  initialState,
  modalDismissed,
  remoteSyncReducer,
  runningTaskAdopted,
  taskCleared,
  taskStarted,
  taskUpdated,
} from "./sync-task-slice";

describe("sync-task-slice", () => {
  describe("taskUpdated with different task types", () => {
    it("should not update currentTask when taskUpdated is for a different task type", () => {
      // Start with export task
      let state = remoteSyncReducer(
        initialState,
        taskStarted({ taskType: "export" }),
      );

      expect(state.currentTask?.sync_task_type).toBe("export");
      expect(state.showModal).toBe(true);

      // Start import task (overwrites export task)
      state = remoteSyncReducer(state, taskStarted({ taskType: "import" }));

      expect(state.currentTask?.sync_task_type).toBe("import");
      expect(state.showModal).toBe(true);

      // Try to update with export task data
      const exportTaskUpdate = createMockRemoteSyncTask({
        id: 1,
        sync_task_type: "export",
        status: "successful",
        progress: 100,
        started_at: new Date().toISOString(),
        ended_at: new Date().toISOString(),
        last_progress_report_at: new Date().toISOString(),
        initiated_by: 1,
      });

      state = remoteSyncReducer(state, taskUpdated(exportTaskUpdate));

      // Current task should still be the import task, not updated to export
      expect(state.currentTask?.sync_task_type).toBe("import");
      expect(state.currentTask?.id).toBe(0); // Still the original import task with id 0
      expect(state.currentTask?.status).toBe("running"); // Still in running state
    });

    it("should update currentTask when taskUpdated is for the same task type", () => {
      // Start with import task
      let state = remoteSyncReducer(
        initialState,
        taskStarted({ taskType: "import" }),
      );

      expect(state.currentTask?.sync_task_type).toBe("import");

      // Update import task with new data
      const importTaskUpdate = createMockRemoteSyncTask({
        id: 1,
        sync_task_type: "import",
        status: "successful",
        progress: 100,
        started_at: new Date().toISOString(),
        ended_at: new Date().toISOString(),
        last_progress_report_at: new Date().toISOString(),
        initiated_by: 1,
      });

      state = remoteSyncReducer(state, taskUpdated(importTaskUpdate));

      // Current task should be updated
      expect(state.currentTask?.sync_task_type).toBe("import");
      expect(state.currentTask?.id).toBe(1);
      expect(state.currentTask?.status).toBe("successful");
      expect(state.currentTask?.progress).toBe(100);
    });

    it("should keep the worktree_id passed to taskStarted", () => {
      const state = remoteSyncReducer(
        initialState,
        taskStarted({ taskType: "import", worktreeId: 5 }),
      );

      expect(state.currentTask?.worktree_id).toBe(5);
      expect(state.showModal).toBe(true);
    });

    it("should not update a worktree task from a main-app task of the same type", () => {
      let state = remoteSyncReducer(
        initialState,
        taskStarted({ taskType: "import", worktreeId: 5 }),
      );

      const mainAppTaskUpdate = createMockRemoteSyncTask({
        id: 1,
        sync_task_type: "import",
        worktree_id: null,
        status: "successful",
      });

      state = remoteSyncReducer(state, taskUpdated(mainAppTaskUpdate));

      expect(state.currentTask?.worktree_id).toBe(5);
      expect(state.currentTask?.status).toBe("running");
    });

    it("should not update a main-app task from a worktree task of the same type", () => {
      let state = remoteSyncReducer(
        initialState,
        taskStarted({ taskType: "import" }),
      );

      const worktreeTaskUpdate = createMockRemoteSyncTask({
        id: 1,
        sync_task_type: "import",
        worktree_id: 5,
        status: "successful",
      });

      state = remoteSyncReducer(state, taskUpdated(worktreeTaskUpdate));

      expect(state.currentTask?.worktree_id).toBeNull();
      expect(state.currentTask?.status).toBe("running");
    });

    it("should update a worktree task from a poll result for the same worktree", () => {
      let state = remoteSyncReducer(
        initialState,
        taskStarted({ taskType: "import", worktreeId: 5 }),
      );

      const worktreeTaskUpdate = createMockRemoteSyncTask({
        id: 1,
        sync_task_type: "import",
        worktree_id: 5,
        status: "successful",
        progress: 1,
      });

      state = remoteSyncReducer(state, taskUpdated(worktreeTaskUpdate));

      expect(state.currentTask?.id).toBe(1);
      expect(state.currentTask?.status).toBe("successful");
    });

    it("should update currentTask when there is no current task", () => {
      // Start with no current task
      let state = initialState;

      expect(state.currentTask).toBeNull();

      // Update with export task data
      const exportTaskUpdate = createMockRemoteSyncTask({
        id: 1,
        sync_task_type: "export",
        status: "successful",
        progress: 100,
        started_at: new Date().toISOString(),
        ended_at: new Date().toISOString(),
        last_progress_report_at: new Date().toISOString(),
        initiated_by: 1,
      });

      state = remoteSyncReducer(state, taskUpdated(exportTaskUpdate));

      // Current task should be set to the export task
      expect(state.currentTask?.sync_task_type).toBe("export");
      expect(state.currentTask?.id).toBe(1);
      expect(state.currentTask?.status).toBe("successful");
    });
  });
  describe("taskStarted across scopes", () => {
    // The backend runs one sync task at a time instance-wide, so a start while another scope's task
    // is running is rejected with a 400; the client must keep tracking the task that is running.
    it("keeps a running task of another scope instead of replacing it", () => {
      let state = remoteSyncReducer(
        initialState,
        taskStarted({ taskType: "import", worktreeId: 5 }),
      );

      state = remoteSyncReducer(
        state,
        taskStarted({ taskType: "import", worktreeId: 7 }),
      );
      expect(state.currentTask?.worktree_id).toBe(5);

      state = remoteSyncReducer(state, taskStarted({ taskType: "import" }));
      expect(state.currentTask?.worktree_id).toBe(5);
      expect(state.showModal).toBe(true);
    });

    it("keeps the main app's running task when a worktree task starts", () => {
      let state = remoteSyncReducer(
        initialState,
        taskStarted({ taskType: "export" }),
      );

      state = remoteSyncReducer(
        state,
        taskStarted({ taskType: "import", worktreeId: 5 }),
      );

      expect(state.currentTask?.worktree_id).toBeNull();
      expect(state.currentTask?.sync_task_type).toBe("export");
    });

    it("replaces another scope's task once it has ended", () => {
      let state = remoteSyncReducer(
        initialState,
        taskUpdated(
          createMockRemoteSyncTask({
            worktree_id: 5,
            sync_task_type: "import",
            status: "successful",
            ended_at: "2000-01-01T00:00:01Z",
          }),
        ),
      );

      state = remoteSyncReducer(state, taskStarted({ taskType: "import" }));

      expect(state.currentTask?.worktree_id).toBeNull();
      expect(state.currentTask?.status).toBe("running");
      expect(state.showModal).toBe(true);
    });

    it("replaces a running task of the same scope", () => {
      let state = remoteSyncReducer(
        initialState,
        taskStarted({ taskType: "export", worktreeId: 5 }),
      );

      state = remoteSyncReducer(
        state,
        taskStarted({ taskType: "import", worktreeId: 5 }),
      );

      expect(state.currentTask?.sync_task_type).toBe("import");
      expect(state.currentTask?.worktree_id).toBe(5);
    });
  });

  describe("taskCleared", () => {
    it("clears the current task when it belongs to the given scope", () => {
      let state = remoteSyncReducer(
        initialState,
        taskStarted({ taskType: "import", worktreeId: 5 }),
      );

      state = remoteSyncReducer(state, taskCleared({ worktreeId: 5 }));

      expect(state.currentTask).toBeNull();
      expect(state.showModal).toBe(false);
    });

    it("leaves another scope's task alone", () => {
      // The rejection of a start that `taskStarted` refused (another scope's task was running)
      // must not clear the task that is actually running.
      let state = remoteSyncReducer(
        initialState,
        taskStarted({ taskType: "import", worktreeId: 5 }),
      );

      state = remoteSyncReducer(state, taskCleared({ worktreeId: 7 }));
      expect(state.currentTask?.worktree_id).toBe(5);

      state = remoteSyncReducer(state, taskCleared({ worktreeId: null }));
      expect(state.currentTask?.worktree_id).toBe(5);
      expect(state.showModal).toBe(true);
    });

    it("is a no-op with no current task", () => {
      const state = remoteSyncReducer(
        initialState,
        taskCleared({ worktreeId: null }),
      );

      expect(state).toEqual(initialState);
    });
  });

  describe("runningTaskAdopted", () => {
    const runningWorktreeTask = createMockRemoteSyncTask({
      id: 9,
      worktree_id: 5,
      sync_task_type: "import",
      status: "running",
      ended_at: null,
    });

    it("tracks a running task and opens the modal when nothing is tracked", () => {
      const state = remoteSyncReducer(
        initialState,
        runningTaskAdopted(runningWorktreeTask),
      );

      expect(state.currentTask?.id).toBe(9);
      expect(state.showModal).toBe(true);
    });

    it("replaces a tracked task that has ended", () => {
      let state = remoteSyncReducer(
        initialState,
        taskUpdated(
          createMockRemoteSyncTask({
            id: 1,
            worktree_id: null,
            status: "successful",
            ended_at: "2000-01-01T00:00:01Z",
          }),
        ),
      );
      state = remoteSyncReducer(state, modalDismissed());

      state = remoteSyncReducer(state, runningTaskAdopted(runningWorktreeTask));

      expect(state.currentTask?.id).toBe(9);
      expect(state.showModal).toBe(true);
    });

    it("does not replace a task that is already tracked as running", () => {
      let state = remoteSyncReducer(
        initialState,
        taskStarted({ taskType: "export" }),
      );

      state = remoteSyncReducer(state, runningTaskAdopted(runningWorktreeTask));

      expect(state.currentTask?.worktree_id).toBeNull();
      expect(state.currentTask?.sync_task_type).toBe("export");
    });

    it("ignores a task that has already ended", () => {
      const state = remoteSyncReducer(
        initialState,
        runningTaskAdopted(
          createMockRemoteSyncTask({
            status: "successful",
            ended_at: "2000-01-01T00:00:01Z",
          }),
        ),
      );

      expect(state).toEqual(initialState);
    });
  });
});
