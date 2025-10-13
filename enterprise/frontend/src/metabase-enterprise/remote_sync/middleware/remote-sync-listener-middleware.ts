import type { PayloadAction } from "@reduxjs/toolkit";
import { createListenerMiddleware, isAnyOf } from "@reduxjs/toolkit";

import { Api } from "metabase/api";
import { cardApi } from "metabase/api/card";
import { collectionApi } from "metabase/api/collection";
import { dashboardApi } from "metabase/api/dashboard";
import { timelineApi } from "metabase/api/timeline";
import { timelineEventApi } from "metabase/api/timeline-event";
import type { Card, Collection, Dashboard, Document } from "metabase-types/api";

import { documentApi } from "../../api/document";
import { remoteSyncApi } from "../../api/remote-sync";
import { REMOTE_SYNC_INVALIDATION_TAGS } from "../constants";
import { taskCleared, taskStarted, taskUpdated } from "../sync-task-slice";

export const remoteSyncListenerMiddleware = createListenerMiddleware();

const startRemoteSyncListening = remoteSyncListenerMiddleware.startListening;

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

  const typeChanged = oldType !== newType;
  const isOrWasRemoteSynced =
    oldType === "remote-synced" || newType === "remote-synced";

  return (typeChanged && isOrWasRemoteSynced) || newType === "remote-synced";
}

startRemoteSyncListening({
  matcher: isAnyOf(
    cardApi.endpoints.createCard.matchFulfilled,
    dashboardApi.endpoints.createDashboard.matchFulfilled,
    documentApi.endpoints.createDocument.matchFulfilled,
  ),
  effect: async (
    action: PayloadAction<Card | Dashboard | Document>,
    listenerApi,
  ) => {
    const entity = action.payload;

    if (entity.is_remote_synced) {
      listenerApi.dispatch(
        Api.util.invalidateTags(REMOTE_SYNC_INVALIDATION_TAGS as any),
      );
    }
  },
});

startRemoteSyncListening({
  matcher: isAnyOf(
    cardApi.endpoints.updateCard.matchFulfilled,
    dashboardApi.endpoints.updateDashboard.matchFulfilled,
    documentApi.endpoints.updateDocument.matchFulfilled,
  ),
  effect: async (
    action: PayloadAction<Card | Dashboard | Document>,
    listenerApi,
  ) => {
    const newEntity = action.payload;
    const state = listenerApi.getState() as any;

    let oldEntity: Card | Dashboard | Document | undefined;

    if ("dataset_query" in newEntity) {
      oldEntity = cardApi.endpoints.getCard.select({ id: newEntity.id })(
        state,
      )?.data;
    } else if ("dashcards" in newEntity) {
      oldEntity = dashboardApi.endpoints.getDashboard.select({
        id: newEntity.id,
      })(state)?.data;
    } else {
      oldEntity = documentApi.endpoints.getDocument.select({
        id: newEntity.id,
      })(state)?.data;
    }

    if (shouldInvalidateForEntity(oldEntity, newEntity)) {
      listenerApi.dispatch(
        Api.util.invalidateTags(REMOTE_SYNC_INVALIDATION_TAGS as any),
      );
    }
  },
});

startRemoteSyncListening({
  matcher: isAnyOf(
    cardApi.endpoints.deleteCard.matchFulfilled,
    dashboardApi.endpoints.deleteDashboard.matchFulfilled,
    documentApi.endpoints.deleteDocument.matchFulfilled,
  ),
  effect: async (action, listenerApi) => {
    const state = listenerApi.getState() as any;
    const id = (action.meta as any).arg.originalArgs as number;

    let entity: Card | Dashboard | Document | undefined;

    if (id) {
      const cardData = cardApi.endpoints.getCard.select({ id })(state)?.data;
      const dashboardData = dashboardApi.endpoints.getDashboard.select({ id })(
        state,
      )?.data;
      const documentData = documentApi.endpoints.getDocument.select({ id })(
        state,
      )?.data;

      entity = cardData ?? dashboardData ?? documentData;
    }

    if (entity?.is_remote_synced) {
      listenerApi.dispatch(
        Api.util.invalidateTags(REMOTE_SYNC_INVALIDATION_TAGS as any),
      );
    }
  },
});

startRemoteSyncListening({
  matcher: collectionApi.endpoints.createCollection.matchFulfilled,
  effect: async (action: PayloadAction<Collection>, listenerApi) => {
    const collection = action.payload;

    if (collection.type === "remote-synced") {
      listenerApi.dispatch(
        Api.util.invalidateTags(REMOTE_SYNC_INVALIDATION_TAGS as any),
      );
    }
  },
});

startRemoteSyncListening({
  matcher: collectionApi.endpoints.updateCollection.matchFulfilled,
  effect: async (action: PayloadAction<Collection>, listenerApi) => {
    const newCollection = action.payload;
    const state = listenerApi.getState() as any;

    const oldCollection = collectionApi.endpoints.getCollection.select({
      id: newCollection.id,
    })(state)?.data;

    if (shouldInvalidateForCollection(oldCollection, newCollection)) {
      listenerApi.dispatch(
        Api.util.invalidateTags(REMOTE_SYNC_INVALIDATION_TAGS as any),
      );
    }
  },
});

startRemoteSyncListening({
  matcher: collectionApi.endpoints.deleteCollection.matchFulfilled,
  effect: async (action, listenerApi) => {
    const state = listenerApi.getState() as any;
    const deleteRequest = (action.meta as any).arg.originalArgs as {
      id: number;
    };

    if (deleteRequest?.id) {
      const collection = collectionApi.endpoints.getCollection.select({
        id: deleteRequest.id,
      })(state)?.data;

      if (collection?.type === "remote-synced") {
        listenerApi.dispatch(
          Api.util.invalidateTags(REMOTE_SYNC_INVALIDATION_TAGS as any),
        );
      }
    }
  },
});

startRemoteSyncListening({
  matcher: isAnyOf(
    timelineApi.endpoints.createTimeline.matchFulfilled,
    timelineApi.endpoints.updateTimeline.matchFulfilled,
    timelineApi.endpoints.deleteTimeline.matchFulfilled,
  ),
  effect: async (action, listenerApi) => {
    listenerApi.dispatch(
      Api.util.invalidateTags(REMOTE_SYNC_INVALIDATION_TAGS as any),
    );
  },
});

startRemoteSyncListening({
  matcher: isAnyOf(
    timelineEventApi.endpoints.createTimelineEvent.matchFulfilled,
    timelineEventApi.endpoints.updateTimelineEvent.matchFulfilled,
    timelineEventApi.endpoints.deleteTimelineEvent.matchFulfilled,
  ),
  effect: async (action, listenerApi) => {
    listenerApi.dispatch(
      Api.util.invalidateTags(REMOTE_SYNC_INVALIDATION_TAGS as any),
    );
  },
});

startRemoteSyncListening({
  matcher: remoteSyncApi.endpoints.exportChanges.matchPending,
  effect: async (action, listenerApi) => {
    listenerApi.dispatch(taskStarted({ taskType: "export" }));
  },
});

startRemoteSyncListening({
  matcher: remoteSyncApi.endpoints.exportChanges.matchRejected,
  effect: async (action, listenerApi) => {
    listenerApi.dispatch(taskCleared());
  },
});

startRemoteSyncListening({
  matcher: isAnyOf(
    remoteSyncApi.endpoints.importFromBranch.matchPending,
    remoteSyncApi.endpoints.updateRemoteSyncSettings.matchPending,
  ),
  effect: async (action, listenerApi) => {
    listenerApi.dispatch(taskStarted({ taskType: "import" }));
  },
});

startRemoteSyncListening({
  matcher: isAnyOf(
    remoteSyncApi.endpoints.importFromBranch.matchRejected,
    remoteSyncApi.endpoints.updateRemoteSyncSettings.matchRejected,
  ),
  effect: async (action, listenerApi) => {
    listenerApi.dispatch(taskCleared());
  },
});

startRemoteSyncListening({
  matcher: remoteSyncApi.endpoints.getCurrentSyncTask.matchFulfilled,
  effect: async (action, listenerApi) => {
    const task = action.payload;

    if (task) {
      listenerApi.dispatch(taskUpdated(task));

      const isTerminalState =
        task.status === "successful" ||
        task.status === "errored" ||
        task.status === "cancelled" ||
        task.status === "timed-out";

      if (isTerminalState && task.ended_at) {
        const isImportTask = task.sync_task_type === "import";
        const isSuccessful = task.status === "successful";

        if (isImportTask && isSuccessful) {
          listenerApi.dispatch(
            Api.util.invalidateTags([
              "action",
              "alert",
              "api-key",
              "bookmark",
              "card",
              "channel",
              "collection",
              "collection-tree",
              "content-translation",
              "dashboard",
              "dashboard-question-candidates",
              "database",
              "document",
              "field",
              "field-values",
              "glossary",
              "indexed-entity",
              "model-index",
              "notification",
              "parameter-values",
              "permissions-group",
              "persisted-info",
              "persisted-model",
              "revision",
              "schema",
              "segment",
              "session-properties",
              "snippet",
              "subscription",
              "subscription-channel",
              "table",
              "task",
              "timeline",
              "timeline-event",
              "user",
              "public-dashboard",
              "embed-dashboard",
              "public-card",
              "embed-card",
              "public-action",
              "unique-tasks",
              "user-key-value",
            ]),
          );
        } else {
          listenerApi.dispatch(
            Api.util.invalidateTags(REMOTE_SYNC_INVALIDATION_TAGS as any),
          );
        }
      }
    }
  },
});
