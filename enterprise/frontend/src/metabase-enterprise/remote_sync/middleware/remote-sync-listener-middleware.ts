import type { PayloadAction } from "@reduxjs/toolkit";
import { createListenerMiddleware, isAnyOf } from "@reduxjs/toolkit";

import { Api } from "metabase/api";
import { cardApi } from "metabase/api/card";
import { collectionApi } from "metabase/api/collection";
import { dashboardApi } from "metabase/api/dashboard";
import { timelineApi } from "metabase/api/timeline";
import { timelineEventApi } from "metabase/api/timeline-event";
import { getCollectionFromCollectionsTree } from "metabase/selectors/collection";
import { documentApi } from "metabase-enterprise/api/document";
import { remoteSyncApi } from "metabase-enterprise/api/remote-sync";
import type {
  Card,
  CardId,
  Collection,
  CollectionId,
  Dashboard,
  DashboardId,
  Document,
  RemoteSyncTaskStatus,
} from "metabase-types/api";
import type { State } from "metabase-types/store";

import { REMOTE_SYNC_INVALIDATION_TAGS } from "../constants";
import {
  modalDismissed,
  taskCleared,
  taskStarted,
  taskUpdated,
} from "../sync-task-slice";

export const remoteSyncListenerMiddleware = createListenerMiddleware<State>();

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
    const oldCard = getOriginalCard(getOriginalState(), newCard.id);

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
    const oldDashboard = getOriginalDashboard(
      getOriginalState(),
      newDashboard.id,
    );

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
    const oldDocument = getOriginalDocument(getOriginalState(), newDocument.id);

    if (shouldInvalidateForEntity(oldDocument, newDocument)) {
      invalidateRemoteSyncTags(dispatch);
    }
  },
});

remoteSyncListenerMiddleware.startListening({
  matcher: cardApi.endpoints.deleteCard.matchFulfilled,
  effect: async (action, { getOriginalState, dispatch }) => {
    const id = (action.meta as any).arg.originalArgs as number;

    if (id) {
      const card = getOriginalCard(getOriginalState(), id);

      if (card?.is_remote_synced) {
        invalidateRemoteSyncTags(dispatch);
      }
    }
  },
});

remoteSyncListenerMiddleware.startListening({
  matcher: dashboardApi.endpoints.deleteDashboard.matchFulfilled,
  effect: async (action, { getOriginalState, dispatch }) => {
    const id = (action.meta as any).arg.originalArgs as number;

    if (id) {
      const dashboard = getOriginalDashboard(getOriginalState(), id);

      if (dashboard?.is_remote_synced) {
        invalidateRemoteSyncTags(dispatch);
      }
    }
  },
});

remoteSyncListenerMiddleware.startListening({
  matcher: documentApi.endpoints.deleteDocument.matchFulfilled,
  effect: async (action, { getOriginalState, dispatch }) => {
    const id = (action.meta as any).arg.originalArgs as number;

    if (id) {
      const document = getOriginalDocument(getOriginalState(), id);

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
    const oldCollection = getOriginalCollection(
      getOriginalState(),
      newCollection.id,
    );

    if (shouldInvalidateForCollection(oldCollection, newCollection)) {
      invalidateRemoteSyncTags(dispatch);
    }
  },
});

remoteSyncListenerMiddleware.startListening({
  matcher: collectionApi.endpoints.deleteCollection.matchFulfilled,
  effect: async (action, { getOriginalState, dispatch }) => {
    const deleteRequest = (action.meta as any).arg.originalArgs as {
      id: number;
    };

    if (deleteRequest?.id) {
      const collection = getOriginalCollection(
        getOriginalState(),
        deleteRequest.id,
      );

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
        const isImportTask = task.sync_task_type === "import";
        const isSuccessful = task.status === "successful";

        if (isSuccessful) {
          setTimeout(() => {
            dispatch(modalDismissed());
          }, 500);

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

const invalidateRemoteSyncTags = (dispatch: any) => {
  dispatch(Api.util.invalidateTags(REMOTE_SYNC_INVALIDATION_TAGS as any));
};

const shouldInvalidateForEntity = (
  oldEntity: Card | Dashboard | Document | undefined,
  newEntity: Card | Dashboard | Document,
): boolean => {
  const oldSynced = oldEntity?.is_remote_synced ?? false;
  const newSynced = newEntity.is_remote_synced ?? false;

  return oldSynced !== newSynced || newSynced;
};

const shouldInvalidateForCollection = (
  oldCollection?: Collection,
  newCollection?: Collection,
): boolean => {
  if (!newCollection) {
    return false;
  }

  const oldType = oldCollection?.type;
  const newType = newCollection.type;

  return oldType === "remote-synced" || newType === "remote-synced";
};

const getOriginalDocument = (originalState: State, id: number) =>
  documentApi.endpoints.getDocument.select({ id })(originalState as any)
    ?.data || originalState.entities.documents[id];

const getOriginalDashboard = (originalState: State, id: DashboardId) =>
  dashboardApi.endpoints.getDashboard.select({ id })(originalState as any)
    ?.data || originalState.entities.dashboards[id];

const getOriginalCard = (originalState: State, id: CardId) =>
  cardApi.endpoints.getCard.select({ id })(originalState as any)?.data ||
  originalState.entities.questions[id];

const getOriginalCollection = (originalState: State, id: CollectionId) =>
  collectionApi.endpoints.getCollection.select({ id })(originalState)?.data ||
  getCollectionFromCollectionsTree(originalState, id);
