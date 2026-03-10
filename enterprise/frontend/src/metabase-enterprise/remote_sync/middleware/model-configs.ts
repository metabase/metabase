import type { UnknownAction } from "@reduxjs/toolkit";

import { cardApi } from "metabase/api/card";
import { collectionApi } from "metabase/api/collection";
import { dashboardApi } from "metabase/api/dashboard";
import { documentApi } from "metabase/api/document";
import { fieldApi } from "metabase/api/field";
import { measureApi } from "metabase/api/measure";
import { segmentApi } from "metabase/api/segment";
import { snippetApi } from "metabase/api/snippet";
import { tableApi as coreTableApi } from "metabase/api/table";
import { timelineApi } from "metabase/api/timeline";
import { timelineEventApi } from "metabase/api/timeline-event";
import { transformApi } from "metabase/api/transform";
import { transformTagApi } from "metabase/api/transform-tag";
import { getCollectionFromCollectionsTree } from "metabase/selectors/collection";
import { pythonLibraryApi } from "metabase-enterprise/api/python-transform-library";
import { tableApi as enterpriseTableApi } from "metabase-enterprise/api/table";
import type { CardId, CollectionId, DashboardId } from "metabase-types/api";
import type { State } from "metabase-types/store";

import {
  InvalidationType,
  type ModelMutationConfig,
} from "./model-invalidation-config";

/**
 * Helper to extract originalArgs from RTK Query mutation actions.
 * RTK Query stores the original arguments in action.meta.arg.originalArgs
 */
function getOriginalArgs<T>(action: UnknownAction): T | undefined {
  const meta = (action as { meta?: { arg?: { originalArgs?: unknown } } }).meta;
  return meta?.arg?.originalArgs as T | undefined;
}

function getOriginalDocument(originalState: State, id: number) {
  // RTK Query selector requires RootState type, but our State type is compatible
  const selector = documentApi.endpoints.getDocument.select({ id });
  return (
    selector(originalState as Parameters<typeof selector>[0])?.data ||
    originalState.entities.documents[id]
  );
}

function getOriginalDashboard(originalState: State, id: DashboardId) {
  const selector = dashboardApi.endpoints.getDashboard.select({ id });
  return (
    selector(originalState as Parameters<typeof selector>[0])?.data ||
    originalState.entities.dashboards[id]
  );
}

function getOriginalCard(originalState: State, id: CardId) {
  const selector = cardApi.endpoints.getCard.select({ id });
  return (
    selector(originalState as Parameters<typeof selector>[0])?.data ||
    originalState.entities.questions[id]
  );
}

function getOriginalCollection(originalState: State, id: CollectionId) {
  return (
    collectionApi.endpoints.getCollection.select({ id })(originalState)?.data ||
    getCollectionFromCollectionsTree(originalState, id)
  );
}

/**
 * Configuration for model mutations that trigger remote sync invalidation.
 *
 * Models are grouped by invalidation strategy:
 * - remote_synced_change: Cards, dashboards, documents (check is_remote_synced)
 * - collection_based: Collections (check collection's is_remote_synced)
 * - always: Table children (fields, segments, measures) and other models
 */
export const MODEL_MUTATION_CONFIGS: ModelMutationConfig[] = [
  // Models with is_remote_synced tracking
  {
    modelType: "card",
    createEndpoints: [cardApi.endpoints.createCard.matchFulfilled],
    updateEndpoints: [cardApi.endpoints.updateCard.matchFulfilled],
    deleteEndpoints: [cardApi.endpoints.deleteCard.matchFulfilled],
    invalidation: {
      type: InvalidationType.RemoteSyncedChange,
      getOriginal: getOriginalCard,
    },
    getDeleteId: (action) => getOriginalArgs<number>(action),
  },
  {
    modelType: "dashboard",
    createEndpoints: [dashboardApi.endpoints.createDashboard.matchFulfilled],
    updateEndpoints: [dashboardApi.endpoints.updateDashboard.matchFulfilled],
    deleteEndpoints: [dashboardApi.endpoints.deleteDashboard.matchFulfilled],
    invalidation: {
      type: InvalidationType.RemoteSyncedChange,
      getOriginal: getOriginalDashboard,
    },
    getDeleteId: (action) => getOriginalArgs<number>(action),
  },
  {
    modelType: "document",
    createEndpoints: [documentApi.endpoints.createDocument.matchFulfilled],
    updateEndpoints: [documentApi.endpoints.updateDocument.matchFulfilled],
    deleteEndpoints: [documentApi.endpoints.deleteDocument.matchFulfilled],
    invalidation: {
      type: InvalidationType.RemoteSyncedChange,
      getOriginal: getOriginalDocument,
    },
    getDeleteId: (action) => getOriginalArgs<number>(action),
  },

  // Collections have special handling
  {
    modelType: "collection",
    createEndpoints: [collectionApi.endpoints.createCollection.matchFulfilled],
    updateEndpoints: [collectionApi.endpoints.updateCollection.matchFulfilled],
    deleteEndpoints: [collectionApi.endpoints.deleteCollection.matchFulfilled],
    invalidation: {
      type: InvalidationType.CollectionBased,
      getOriginalCollection: getOriginalCollection,
    },
    getDeleteId: (action) => getOriginalArgs<{ id: number }>(action),
  },

  // Always-invalidate models (table children and related)
  {
    modelType: "timeline",
    createEndpoints: [timelineApi.endpoints.createTimeline.matchFulfilled],
    updateEndpoints: [timelineApi.endpoints.updateTimeline.matchFulfilled],
    deleteEndpoints: [timelineApi.endpoints.deleteTimeline.matchFulfilled],
    invalidation: { type: InvalidationType.Always },
  },
  {
    modelType: "timelineEvent",
    createEndpoints: [
      timelineEventApi.endpoints.createTimelineEvent.matchFulfilled,
    ],
    updateEndpoints: [
      timelineEventApi.endpoints.updateTimelineEvent.matchFulfilled,
    ],
    deleteEndpoints: [
      timelineEventApi.endpoints.deleteTimelineEvent.matchFulfilled,
    ],
    invalidation: { type: InvalidationType.Always },
  },
  {
    modelType: "enterpriseTable",
    createEndpoints: [
      enterpriseTableApi.endpoints.publishTables.matchFulfilled,
    ],
    updateEndpoints: [coreTableApi.endpoints.editTables.matchFulfilled],
    deleteEndpoints: [
      enterpriseTableApi.endpoints.unpublishTables.matchFulfilled,
    ],
    invalidation: { type: InvalidationType.Always },
  },
  {
    modelType: "coreTable",
    updateEndpoints: [
      coreTableApi.endpoints.updateTable.matchFulfilled,
      coreTableApi.endpoints.updateTableFieldsOrder.matchFulfilled,
    ],
    invalidation: { type: InvalidationType.Always },
  },
  {
    modelType: "field",
    updateEndpoints: [
      fieldApi.endpoints.updateField.matchFulfilled,
      fieldApi.endpoints.createFieldDimension.matchFulfilled,
      fieldApi.endpoints.deleteFieldDimension.matchFulfilled,
    ],
    invalidation: { type: InvalidationType.Always },
  },
  {
    modelType: "segment",
    createEndpoints: [segmentApi.endpoints.createSegment.matchFulfilled],
    updateEndpoints: [segmentApi.endpoints.updateSegment.matchFulfilled],
    invalidation: { type: InvalidationType.Always },
  },
  {
    modelType: "measure",
    createEndpoints: [measureApi.endpoints.createMeasure.matchFulfilled],
    updateEndpoints: [measureApi.endpoints.updateMeasure.matchFulfilled],
    invalidation: { type: InvalidationType.Always },
  },
  {
    modelType: "snippet",
    createEndpoints: [snippetApi.endpoints.createSnippet.matchFulfilled],
    updateEndpoints: [snippetApi.endpoints.updateSnippet.matchFulfilled],
    invalidation: { type: InvalidationType.Always },
  },
  {
    modelType: "transform",
    createEndpoints: [transformApi.endpoints.createTransform.matchFulfilled],
    updateEndpoints: [transformApi.endpoints.updateTransform.matchFulfilled],
    deleteEndpoints: [transformApi.endpoints.deleteTransform.matchFulfilled],
    invalidation: { type: InvalidationType.Always },
  },
  {
    modelType: "transformTag",
    createEndpoints: [
      transformTagApi.endpoints.createTransformTag.matchFulfilled,
    ],
    updateEndpoints: [
      transformTagApi.endpoints.updateTransformTag.matchFulfilled,
    ],
    deleteEndpoints: [
      transformTagApi.endpoints.deleteTransformTag.matchFulfilled,
    ],
    invalidation: { type: InvalidationType.Always },
  },
  {
    modelType: "pythonLibrary",
    // PythonLibrary only has an upsert endpoint (updatePythonLibrary creates or updates)
    updateEndpoints: [
      pythonLibraryApi.endpoints.updatePythonLibrary.matchFulfilled,
    ],
    invalidation: { type: InvalidationType.Always },
  },
];
