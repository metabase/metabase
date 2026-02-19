import type { ThunkDispatch, UnknownAction } from "@reduxjs/toolkit";
import { createListenerMiddleware } from "@reduxjs/toolkit";

import { Api } from "metabase/api";
import { EnterpriseApi } from "metabase-enterprise/api/api";
import { remoteSyncApi } from "metabase-enterprise/api/remote-sync";
import { tag } from "metabase-enterprise/api/tags";
import type { RemoteSyncTaskStatus } from "metabase-types/api";
import type { State } from "metabase-types/store";

import { REMOTE_SYNC_INVALIDATION_TAGS } from "../constants";
import {
  modalDismissed,
  syncConflictVariantUpdated,
  taskCleared,
  taskStarted,
  taskUpdated,
} from "../sync-task-slice";

import { registerModelMutationListeners } from "./register-listeners";

type AppDispatch = ThunkDispatch<State, unknown, UnknownAction>;

export const remoteSyncListenerMiddleware = createListenerMiddleware<State>();

// Register all model mutation listeners using the data-driven configuration
registerModelMutationListeners(remoteSyncListenerMiddleware);

function invalidateRemoteSyncTags(dispatch: AppDispatch) {
  // Type assertion needed because Api is typed with base TagType,
  // but enterprise uses EnterpriseTagType which is a superset
  dispatch(Api.util.invalidateTags(REMOTE_SYNC_INVALIDATION_TAGS as never));
}

const ALL_INVALIDATION_TAGS = [
  tag("action"),
  tag("alert"),
  tag("bookmark"),
  tag("card"),
  tag("channel"),
  tag("collection"),
  tag("collection-tree"),
  tag("content-translation"),
  tag("dashboard"),
  tag("dashboard-question-candidates"),
  tag("document"),
  tag("embed-card"),
  tag("embed-dashboard"),
  tag("indexed-entity"),
  tag("notification"),
  tag("parameter-values"),
  tag("public-action"),
  tag("public-card"),
  tag("public-dashboard"),
  tag("revision"),
  tag("segment"),
  tag("session-properties"),
  tag("snippet"),
  tag("subscription"),
  tag("subscription-channel"),
  tag("timeline"),
  tag("timeline-event"),
  tag("transform"),
  tag("python-transform-library"),
];

remoteSyncListenerMiddleware.startListening({
  matcher: remoteSyncApi.endpoints.exportChanges.matchPending,
  effect: async (_action, { dispatch }) => {
    dispatch(taskStarted({ taskType: "export" }));
  },
});

remoteSyncListenerMiddleware.startListening({
  matcher: remoteSyncApi.endpoints.exportChanges.matchRejected,
  effect: async (_action, { dispatch }) => {
    dispatch(taskCleared());
  },
});

remoteSyncListenerMiddleware.startListening({
  matcher: remoteSyncApi.endpoints.importChanges.matchPending,
  effect: async (_action, { dispatch }) => {
    dispatch(taskStarted({ taskType: "import" }));
  },
});

remoteSyncListenerMiddleware.startListening({
  matcher: remoteSyncApi.endpoints.updateRemoteSyncSettings.matchFulfilled,
  effect: async (action, { dispatch }) => {
    const response = action.payload;
    // Only show modal if a task was actually started (indicated by task_id presence)
    if (response.task_id) {
      dispatch(taskStarted({ taskType: "import" }));
    }
  },
});

remoteSyncListenerMiddleware.startListening({
  matcher: remoteSyncApi.endpoints.importChanges.matchRejected,
  effect: async (_action, { dispatch }) => {
    dispatch(taskCleared());
  },
});

const terminalTaskStates: RemoteSyncTaskStatus[] = [
  "successful",
  "errored",
  "cancelled",
  "timed-out",
] as const;

remoteSyncListenerMiddleware.startListening({
  matcher: remoteSyncApi.endpoints.getRemoteSyncCurrentTask.matchFulfilled,
  effect: async (action, { dispatch }) => {
    const task = action.payload;

    if (task) {
      dispatch(taskUpdated(task));

      if (task.status === "conflict") {
        dispatch(modalDismissed());
        dispatch(syncConflictVariantUpdated("setup"));
        return;
      }

      const isTerminalState = terminalTaskStates.includes(task.status);

      if (isTerminalState && task.ended_at) {
        const isImportTask = task.sync_task_type === "import";
        const isSuccessful = task.status === "successful";

        if (isSuccessful) {
          setTimeout(() => {
            dispatch(modalDismissed());
          }, 500);

          if (isImportTask) {
            dispatch(EnterpriseApi.util.invalidateTags(ALL_INVALIDATION_TAGS));
          }
        }

        invalidateRemoteSyncTags(dispatch);
      }
    }
  },
});
