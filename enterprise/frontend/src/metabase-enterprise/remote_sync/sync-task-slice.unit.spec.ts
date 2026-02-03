import type { RemoteSyncTask } from "metabase-types/api";

import {
  initialState,
  remoteSyncReducer,
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
      const exportTaskUpdate: RemoteSyncTask = {
        id: 1,
        sync_task_type: "export",
        status: "successful",
        progress: 100,
        started_at: new Date().toISOString(),
        ended_at: new Date().toISOString(),
        last_progress_report_at: new Date().toISOString(),
        error_message: null,
        initiated_by: 1,
      };

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
      const importTaskUpdate: RemoteSyncTask = {
        id: 1,
        sync_task_type: "import",
        status: "successful",
        progress: 100,
        started_at: new Date().toISOString(),
        ended_at: new Date().toISOString(),
        last_progress_report_at: new Date().toISOString(),
        error_message: null,
        initiated_by: 1,
      };

      state = remoteSyncReducer(state, taskUpdated(importTaskUpdate));

      // Current task should be updated
      expect(state.currentTask?.sync_task_type).toBe("import");
      expect(state.currentTask?.id).toBe(1);
      expect(state.currentTask?.status).toBe("successful");
      expect(state.currentTask?.progress).toBe(100);
    });

    it("should update currentTask when there is no current task", () => {
      // Start with no current task
      let state = initialState;

      expect(state.currentTask).toBeNull();

      // Update with export task data
      const exportTaskUpdate: RemoteSyncTask = {
        id: 1,
        sync_task_type: "export",
        status: "successful",
        progress: 100,
        started_at: new Date().toISOString(),
        ended_at: new Date().toISOString(),
        last_progress_report_at: new Date().toISOString(),
        error_message: null,
        initiated_by: 1,
      };

      state = remoteSyncReducer(state, taskUpdated(exportTaskUpdate));

      // Current task should be set to the export task
      expect(state.currentTask?.sync_task_type).toBe("export");
      expect(state.currentTask?.id).toBe(1);
      expect(state.currentTask?.status).toBe("successful");
    });
  });
});
