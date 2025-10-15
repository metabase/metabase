import fetchMock from "fetch-mock";
import _ from "underscore";

import { ROOT_COLLECTION } from "metabase/entities/collections/constants";
import {
  SAVED_QUESTIONS_VIRTUAL_DB_ID,
  convertSavedQuestionToVirtualTable,
  getCollectionVirtualSchemaName,
} from "metabase-lib/v1/metadata/utils/saved-questions";
import type {
  Card,
  Collection,
  CollectionItem,
  Dashboard,
  DashboardQuestionCandidate,
} from "metabase-types/api";
import { createMockCollection } from "metabase-types/api/mocks";

import { PERMISSION_ERROR } from "./constants";

const mockTrashCollection = createMockCollection({
  id: 20000000,
  name: "Trash",
});

export interface CollectionEndpoints {
  collections: Collection[];
  rootCollection?: Collection;
  trashCollection?: Collection;
}

export function setupCollectionsEndpoints({
  collections,
  rootCollection = createMockCollection(ROOT_COLLECTION),
  trashCollection = mockTrashCollection,
}: CollectionEndpoints) {
  fetchMock.get("path:/api/collection/root", rootCollection, {
    name: "collection-root",
  });
  fetchMock.get(`path:/api/collection/trash`, trashCollection, {
    name: "collection-trash",
  });
  fetchMock.get(`path:/api/collection/${trashCollection.id}`, trashCollection, {
    name: `collection-${trashCollection.id}`,
  });
  fetchMock.get(
    "path:/api/collection/tree",
    collections.filter((collection) => !collection.archived),
    { name: "collection-tree-exclude-archived" },
  );
  fetchMock.get("path:/api/collection/tree", collections, {
    name: "collection-tree",
  });
  fetchMock.get("path:/api/collection", collections, {
    name: "collection-list",
  });
}

function getCollectionVirtualSchemaURLs(collection: Collection) {
  const db = SAVED_QUESTIONS_VIRTUAL_DB_ID;
  const schemaName = getCollectionVirtualSchemaName(collection);
  const schema = encodeURIComponent(schemaName);

  const questions = ["path:/api/database/", db, "/schema/", schema].join("");
  const models = ["path:/api/database/", db, "/datasets/", schema].join("");

  return { questions, models };
}

export function setupCollectionVirtualSchemaEndpoints(
  collection: Collection,
  cards: Card[],
) {
  const urls = getCollectionVirtualSchemaURLs(collection);

  const [models, questions] = _.partition(
    cards,
    (card) => card.type === "model",
  );
  const modelVirtualTables = models.map(convertSavedQuestionToVirtualTable);
  const questionVirtualTables = questions.map(
    convertSavedQuestionToVirtualTable,
  );

  fetchMock.get(urls.questions, questionVirtualTables, {
    name: "collection-questions-virtual-tables",
  });
  fetchMock.get(urls.models, modelVirtualTables, {
    name: "collection-models-virtual-tables",
  });
}

export function setupCollectionItemsEndpoint({
  collection,
  collectionItems = [],
  models: modelsParam,
}: {
  collection: Pick<Collection, "id">;
  collectionItems: CollectionItem[];
  models?: string[];
}) {
  fetchMock.get(
    `path:/api/collection/${collection.id}/items`,
    (call) => {
      const url = new URL(call.url);
      const models = modelsParam ?? url.searchParams.getAll("models");
      const matchedItems = collectionItems.filter(({ model }) =>
        models.includes(model),
      );

      const limit =
        Number(url.searchParams.get("limit")) || matchedItems.length;
      const offset = Number(url.searchParams.get("offset")) || 0;

      return {
        data: matchedItems.slice(offset, offset + limit),
        total: matchedItems.length,
        models,
        limit,
        offset,
      };
    },
    { name: `collection-${collection.id}-items` },
  );
}

export function setupDashboardItemsEndpoint({
  dashboard,
  dashboardItems,
  models: modelsParam,
}: {
  dashboard: Dashboard;
  dashboardItems: CollectionItem[];
  models?: string[];
}) {
  fetchMock.get(`path:/api/dashboard/${dashboard.id}/items`, (call) => {
    const url = new URL(call.url);
    const models = modelsParam ?? url.searchParams.getAll("models") ?? ["card"];
    const limit =
      Number(url.searchParams.get("limit")) || dashboardItems.length;
    const offset = Number(url.searchParams.get("offset")) || 0;

    return {
      data: dashboardItems.slice(offset, offset + limit),
      total: dashboardItems.length,
      models,
      limit,
      offset,
    };
  });
}

export function setupCollectionsWithError({
  error,
  status = 500,
}: {
  error: string;
  status?: number;
}) {
  fetchMock.get("path:/api/collection", {
    body: error,
    status,
  });
}

export function setupUnauthorizedCollectionsEndpoints(
  collections: Collection[],
) {
  collections.forEach(setupUnauthorizedCollectionEndpoints);
}

export function setupUnauthorizedCollectionEndpoints(collection: Collection) {
  fetchMock.get(`path:/api/collection/${collection.id}`, {
    status: 403,
    body: PERMISSION_ERROR,
  });
  fetchMock.get(`path:/api/collection/${collection.id}/items`, {
    status: 403,
    body: PERMISSION_ERROR,
  });
}

export function setupCollectionByIdEndpoint({
  collections,
  error,
}: {
  collections: Collection[];
  error?: string;
}) {
  if (error) {
    setupCollectionWithErrorById({ error });
    return;
  }

  fetchMock.get(/api\/collection\/(\d+|root)$/, (call) => {
    const urlString = call.url;
    const parts = urlString.split("/");
    const collectionIdParam = parts[parts.length - 1];
    const collectionId =
      collectionIdParam === "root" ? "root" : Number(collectionIdParam);

    const collection = collections.find(
      (collection) => collection.id === collectionId,
    );

    return collection || { status: 404, body: "Collection not found" };
  });
}

function setupCollectionWithErrorById({
  error,
  status = 500,
}: {
  error: string;
  status?: number;
}) {
  fetchMock.get(/api\/collection\/\d+|root/, {
    body: error,
    status,
  });
}

export function setupDashboardCollectionItemsEndpoint(dashboards: Dashboard[]) {
  fetchMock.get(/api\/collection\/(\d+|root)\/items/, (call) => {
    const urlString = call.url;
    const parts = urlString.split("/");
    const collectionIdParam = parts[parts.indexOf("collection") + 1];
    const collectionId =
      collectionIdParam !== "root" ? Number(collectionIdParam) : null;

    const dashboardsOfCollection = dashboards.filter(
      (dashboard) => dashboard.collection_id === collectionId,
    );

    return {
      total: dashboardsOfCollection.length,
      data: dashboardsOfCollection,
    };
  });
}

export function setupDashboardQuestionCandidatesEndpoint(
  dashboardQuestionCandidates: DashboardQuestionCandidate[],
) {
  fetchMock.get("express:/api/collection/:id/dashboard-question-candidates", {
    total: dashboardQuestionCandidates.length,
    data: dashboardQuestionCandidates,
  });
}

export function setupStaleItemsEndpoint(total: number) {
  fetchMock.get("express:/api/ee/stale/:id", {
    total,
  });
}
