import type { PayloadAction } from "@reduxjs/toolkit";
import { createListenerMiddleware, isAnyOf } from "@reduxjs/toolkit";

import { Api } from "metabase/api";
import { cardApi } from "metabase/api/card";
import { collectionApi } from "metabase/api/collection";
import { dashboardApi } from "metabase/api/dashboard";
import { timelineApi } from "metabase/api/timeline";
import { timelineEventApi } from "metabase/api/timeline-event";
import { delay } from "metabase/lib/promise";
import type {
  Card,
  Collection,
  Dashboard,
  Document,
  RemoteSyncTaskStatus,
} from "metabase-types/api";
import type { State } from "metabase-types/store";

import { documentApi } from "../../api/document";
import { remoteSyncApi } from "../../api/remote-sync";
import { REMOTE_SYNC_INVALIDATION_TAGS } from "../constants";
import {
  modalDismissed,
  taskCleared,
  taskStarted,
  taskUpdated,
} from "../sync-task-slice";

export const remoteSyncListenerMiddleware = createListenerMiddleware<State>();

function invalidateRemoteSyncTags(dispatch: any) {
  dispatch(Api.util.invalidateTags(REMOTE_SYNC_INVALIDATION_TAGS as any));
}

function shouldInvalidateForEntity(
  oldEntity: Card | Dashboard | Document | undefined,
  newEntity: Card | Dashboard | Document,
): boolean {
  const oldSynced = oldEntity?.is_remote_synced ?? false;
  const newSynced = newEntity.is_remote_synced ?? false;

  return oldSynced !== newSynced || newSynced;
}

function shouldInvalidateForCollection(
  oldCollection: Collection | undefined,
  newCollection: Collection | undefined,
): boolean {
  if (!newCollection) {
    return false;
  }

  const oldType = oldCollection?.type;
  const newType = newCollection.type;

  return oldType === "remote-synced" || newType === "remote-synced";
}

remoteSyncListenerMiddleware.startListening({
  matcher: isAnyOf(
    cardApi.endpoints.createCard.matchFulfilled,
    dashboardApi.endpoints.createDashboard.matchFulfilled,
    documentApi.endpoints.createDocument.matchFulfilled,
  ),
  effect: async (
    action: PayloadAction<Card | Dashboard | Document>,
    { dispatch },
  ) => {
    const entity = action.payload;

    if (entity.is_remote_synced) {
      invalidateRemoteSyncTags(dispatch);
    }
  },
});

remoteSyncListenerMiddleware.startListening({
  matcher: cardApi.endpoints.updateCard.matchFulfilled,
  effect: async (
    action: PayloadAction<Card>,
    { getOriginalState, dispatch },
  ) => {
    const newCard = action.payload;
    const originalState = getOriginalState();

    const oldCard = cardApi.endpoints.getCard.select({ id: newCard.id })(
      originalState,
    )?.data;

    if (shouldInvalidateForEntity(oldCard, newCard)) {
      invalidateRemoteSyncTags(dispatch);
    }
  },
});

remoteSyncListenerMiddleware.startListening({
  matcher: dashboardApi.endpoints.updateDashboard.matchFulfilled,
  effect: async (
    action: PayloadAction<Dashboard>,
    { getOriginalState, dispatch },
  ) => {
    const newDashboard = action.payload;
    const originalState = getOriginalState();

    const oldDashboard = dashboardApi.endpoints.getDashboard.select({
      id: newDashboard.id,
    })(originalState)?.data;

    if (shouldInvalidateForEntity(oldDashboard, newDashboard)) {
      invalidateRemoteSyncTags(dispatch);
    }
  },
});

remoteSyncListenerMiddleware.startListening({
  matcher: documentApi.endpoints.updateDocument.matchFulfilled,
  effect: async (
    action: PayloadAction<Document>,
    { getOriginalState, dispatch },
  ) => {
    const newDocument = action.payload;
    const originalState = getOriginalState();

    const oldDocument = documentApi.endpoints.getDocument.select({
      id: newDocument.id,
    })(originalState as any)?.data;

    if (shouldInvalidateForEntity(oldDocument, newDocument)) {
      invalidateRemoteSyncTags(dispatch);
    }
  },
});

remoteSyncListenerMiddleware.startListening({
  matcher: cardApi.endpoints.deleteCard.matchFulfilled,
  effect: async (action, { getOriginalState, dispatch }) => {
    const originalState = getOriginalState();
    const id = (action.meta as any).arg.originalArgs as number;

    if (id) {
      const card = cardApi.endpoints.getCard.select({ id })(
        originalState,
      )?.data;

      if (card?.is_remote_synced) {
        invalidateRemoteSyncTags(dispatch);
      }
    }
  },
});

remoteSyncListenerMiddleware.startListening({
  matcher: dashboardApi.endpoints.deleteDashboard.matchFulfilled,
  effect: async (action, { getOriginalState, dispatch }) => {
    const originalState = getOriginalState();
    const id = (action.meta as any).arg.originalArgs as number;

    if (id) {
      const dashboard = dashboardApi.endpoints.getDashboard.select({ id })(
        originalState,
      )?.data;

      if (dashboard?.is_remote_synced) {
        invalidateRemoteSyncTags(dispatch);
      }
    }
  },
});

remoteSyncListenerMiddleware.startListening({
  matcher: documentApi.endpoints.deleteDocument.matchFulfilled,
  effect: async (action, { getOriginalState, dispatch }) => {
    const originalState = getOriginalState();
    const id = (action.meta as any).arg.originalArgs as number;

    if (id) {
      const document = documentApi.endpoints.getDocument.select({ id })(
        originalState as any,
      )?.data;

      if (document?.is_remote_synced) {
        invalidateRemoteSyncTags(dispatch);
      }
    }
  },
});

remoteSyncListenerMiddleware.startListening({
  matcher: collectionApi.endpoints.createCollection.matchFulfilled,
  effect: async (action: PayloadAction<Collection>, { dispatch }) => {
    const collection = action.payload;

    if (collection.type === "remote-synced") {
      invalidateRemoteSyncTags(dispatch);
    }
  },
});

remoteSyncListenerMiddleware.startListening({
  matcher: collectionApi.endpoints.updateCollection.matchFulfilled,
  effect: async (
    action: PayloadAction<Collection>,
    { getOriginalState, dispatch },
  ) => {
    const newCollection = action.payload;
    const originalState = getOriginalState();

    const oldCollection = collectionApi.endpoints.getCollection.select({
      id: newCollection.id,
    })(originalState)?.data;

    if (shouldInvalidateForCollection(oldCollection, newCollection)) {
      invalidateRemoteSyncTags(dispatch);
    }
  },
});

remoteSyncListenerMiddleware.startListening({
  matcher: collectionApi.endpoints.deleteCollection.matchFulfilled,
  effect: async (action, { getOriginalState, dispatch }) => {
    const originalState = getOriginalState();
    const deleteRequest = (action.meta as any).arg.originalArgs as {
      id: number;
    };

    if (deleteRequest?.id) {
      const collection = collectionApi.endpoints.getCollection.select({
        id: deleteRequest.id,
      })(originalState)?.data;

      if (collection?.type === "remote-synced") {
        invalidateRemoteSyncTags(dispatch);
      }
    }
  },
});

remoteSyncListenerMiddleware.startListening({
  matcher: isAnyOf(
    timelineApi.endpoints.createTimeline.matchFulfilled,
    timelineApi.endpoints.updateTimeline.matchFulfilled,
    timelineApi.endpoints.deleteTimeline.matchFulfilled,
  ),
  effect: async (_action, { dispatch }) => {
    invalidateRemoteSyncTags(dispatch);
  },
});

remoteSyncListenerMiddleware.startListening({
  matcher: isAnyOf(
    timelineEventApi.endpoints.createTimelineEvent.matchFulfilled,
    timelineEventApi.endpoints.updateTimelineEvent.matchFulfilled,
    timelineEventApi.endpoints.deleteTimelineEvent.matchFulfilled,
  ),
  effect: async (_action, { dispatch }) => {
    invalidateRemoteSyncTags(dispatch);
  },
});

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
  matcher: isAnyOf(
    remoteSyncApi.endpoints.importChanges.matchPending,
    remoteSyncApi.endpoints.updateRemoteSyncSettings.matchPending,
  ),
  effect: async (_action, { dispatch }) => {
    dispatch(taskStarted({ taskType: "import" }));
  },
});

remoteSyncListenerMiddleware.startListening({
  matcher: isAnyOf(
    remoteSyncApi.endpoints.importChanges.matchRejected,
    remoteSyncApi.endpoints.updateRemoteSyncSettings.matchRejected,
  ),
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

      const isTerminalState = terminalTaskStates.includes(task.status);

      if (isTerminalState && task.ended_at) {
        // FIXME: Currently backend doesn't immediately update settings or dirty state
        // after task finishes, adding a slight delay to ensure the state is updated
        const hackTimeout = task.sync_task_type === "import" ? 1000 : 2500;
        await delay(hackTimeout);

        const isImportTask = task.sync_task_type === "import";
        const isSuccessful = task.status === "successful";

        if (isSuccessful) {
          dispatch(modalDismissed());

          if (isImportTask) {
            dispatch(
              Api.util.invalidateTags([
                "action",
                "alert",
                "bookmark",
                "card",
                "channel",
                "collection",
                "collection-tree",
                "content-translation",
                "dashboard",
                "dashboard-question-candidates",
                "document",
                "embed-card",
                "embed-dashboard",
                "indexed-entity",
                "notification",
                "parameter-values",
                "public-action",
                "public-card",
                "public-dashboard",
                "revision",
                "segment",
                "session-properties",
                "snippet",
                "subscription",
                "subscription-channel",
                "timeline",
                "timeline-event",
              ]),
            );
          }
        }

        invalidateRemoteSyncTags(dispatch);
      }
    }
  },
});
