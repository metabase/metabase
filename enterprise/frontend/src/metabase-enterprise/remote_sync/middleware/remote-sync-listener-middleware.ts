import type { ThunkDispatch, UnknownAction } from "@reduxjs/toolkit";
import { createListenerMiddleware } from "@reduxjs/toolkit";

import { Api } from "metabase/api";
import type { State } from "metabase/redux/store";
import { EnterpriseApi } from "metabase-enterprise/api/api";
import { remoteSyncApi } from "metabase-enterprise/api/remote-sync";
import { tag } from "metabase-enterprise/api/tags";
import type { RemoteSyncTaskStatus } from "metabase-types/api";

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
        // The first-import / setup flow surfaces conflicts as a task status. Export conflicts are
        // surfaced as a toast by GitSyncControls (which observes the task), not here — middleware can't
        // use the useToast hook.
        if (task.sync_task_type !== "export") {
          dispatch(syncConflictVariantUpdated("setup"));
        }
        return;
      }

      const isTerminalState = terminalTaskStates.includes(task.status);

      if (isTerminalState && task.ended_at) {
        const isSuccessful = task.status === "successful";

        if (isSuccessful) {
          // Leave the modal open showing the success confirmation; the user dismisses it explicitly
          // (the sync can take a while, so we want to acknowledge completion rather than silently close).

          // Both import and a merged export change local content, so refresh everything. A plain push
          // doesn't change local data, but the extra refetch is harmless and keeps this simple.
          dispatch(EnterpriseApi.util.invalidateTags(ALL_INVALIDATION_TAGS));
        }

        invalidateRemoteSyncTags(dispatch);
      }
    }
  },
});
