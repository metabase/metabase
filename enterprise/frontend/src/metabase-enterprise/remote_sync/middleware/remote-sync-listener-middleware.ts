import type { PayloadAction } from "@reduxjs/toolkit";
import { createListenerMiddleware, isAnyOf } from "@reduxjs/toolkit";

import { Api } from "metabase/api";
import { cardApi } from "metabase/api/card";
import { collectionApi } from "metabase/api/collection";
import { dashboardApi } from "metabase/api/dashboard";
import { documentApi } from "metabase/api/document";
import { fieldApi } from "metabase/api/field";
import { segmentApi } from "metabase/api/segment";
import { tableApi as coreTableApi } from "metabase/api/table";
import { tag } from "metabase/api/tags";
import { timelineApi } from "metabase/api/timeline";
import { timelineEventApi } from "metabase/api/timeline-event";
import { getCollectionFromCollectionsTree } from "metabase/selectors/collection";
import { remoteSyncApi } from "metabase-enterprise/api/remote-sync";
import { tableApi as enterpriseTableApi } from "metabase-enterprise/api/table";
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

function invalidateRemoteSyncTags(dispatch: any) {
  dispatch(Api.util.invalidateTags(REMOTE_SYNC_INVALIDATION_TAGS as any));
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
];

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

  const oldSynced = oldCollection?.is_remote_synced ?? false;
  const newSynced = newCollection.is_remote_synced ?? false;

  return oldSynced || newSynced;
}

function getOriginalDocument(originalState: State, id: number) {
  return (
    documentApi.endpoints.getDocument.select({ id })(originalState as any)
      ?.data || originalState.entities.documents[id]
  );
}

function getOriginalDashboard(originalState: State, id: DashboardId) {
  return (
    dashboardApi.endpoints.getDashboard.select({ id })(originalState as any)
      ?.data || originalState.entities.dashboards[id]
  );
}

function getOriginalCard(originalState: State, id: CardId) {
  return (
    cardApi.endpoints.getCard.select({ id })(originalState as any)?.data ||
    originalState.entities.questions[id]
  );
}

function getOriginalCollection(originalState: State, id: CollectionId) {
  return (
    collectionApi.endpoints.getCollection.select({ id })(originalState)?.data ||
    getCollectionFromCollectionsTree(originalState, id)
  );
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

    if (collection.is_remote_synced) {
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

      if (collection?.is_remote_synced) {
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

// Enterprise table mutations (publish/unpublish/edit)
remoteSyncListenerMiddleware.startListening({
  matcher: isAnyOf(
    enterpriseTableApi.endpoints.publishTables.matchFulfilled,
    enterpriseTableApi.endpoints.unpublishTables.matchFulfilled,
    enterpriseTableApi.endpoints.editTables.matchFulfilled,
  ),
  effect: async (_action, { dispatch }) => {
    invalidateRemoteSyncTags(dispatch);
  },
});

// Core table mutations (metadata edits)
remoteSyncListenerMiddleware.startListening({
  matcher: isAnyOf(
    coreTableApi.endpoints.updateTable.matchFulfilled,
    coreTableApi.endpoints.updateTableFieldsOrder.matchFulfilled,
  ),
  effect: async (_action, { dispatch }) => {
    invalidateRemoteSyncTags(dispatch);
  },
});

// Field mutations
remoteSyncListenerMiddleware.startListening({
  matcher: isAnyOf(
    fieldApi.endpoints.updateField.matchFulfilled,
    fieldApi.endpoints.createFieldDimension.matchFulfilled,
    fieldApi.endpoints.deleteFieldDimension.matchFulfilled,
  ),
  effect: async (_action, { dispatch }) => {
    invalidateRemoteSyncTags(dispatch);
  },
});

// Segment mutations
remoteSyncListenerMiddleware.startListening({
  matcher: isAnyOf(
    segmentApi.endpoints.createSegment.matchFulfilled,
    segmentApi.endpoints.updateSegment.matchFulfilled,
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

      const isTerminalState = terminalTaskStates.includes(task.status);

      if (isTerminalState && task.ended_at) {
        const isImportTask = task.sync_task_type === "import";
        const isSuccessful = task.status === "successful";

        if (isSuccessful) {
          setTimeout(() => {
            dispatch(modalDismissed());
          }, 500);

          if (isImportTask) {
            dispatch(Api.util.invalidateTags(ALL_INVALIDATION_TAGS));
          }
        }

        invalidateRemoteSyncTags(dispatch);
      }
    }
  },
});
