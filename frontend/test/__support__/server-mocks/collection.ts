import fetchMock from "fetch-mock";
import _ from "underscore";
import type {
  Card,
  Collection,
  CollectionItem,
  Dashboard,
} from "metabase-types/api";
import { createMockCollection } from "metabase-types/api/mocks";
import { ROOT_COLLECTION } from "metabase/entities/collections";
import {
  SAVED_QUESTIONS_VIRTUAL_DB_ID,
  convertSavedQuestionToVirtualTable,
  getCollectionVirtualSchemaName,
} from "metabase-lib/metadata/utils/saved-questions";
import { PERMISSION_ERROR } from "./constants";

export interface CollectionEndpoints {
  collections: Collection[];
  rootCollection?: Collection;
}

export function setupCollectionsEndpoints({
  collections,
  rootCollection = createMockCollection(ROOT_COLLECTION),
}: CollectionEndpoints) {
  fetchMock.get("path:/api/collection/root", rootCollection);
  fetchMock.get(
    {
      url: "path:/api/collection/tree",
      query: { tree: true, "exclude-archived": true },
      overwriteRoutes: false,
    },
    collections.filter(collection => !collection.archived),
  );
  fetchMock.get(
    {
      url: "path:/api/collection/tree",
      query: { tree: true },
      overwriteRoutes: false,
    },
    collections,
  );
  fetchMock.get(
    { url: "path:/api/collection", overwriteRoutes: false },
    collections,
  );
}

function getCollectionVirtualSchemaURLs(collection: Collection) {
  const db = SAVED_QUESTIONS_VIRTUAL_DB_ID;
  const schemaName = getCollectionVirtualSchemaName(collection);
  const schema = encodeURIComponent(schemaName);

  const questions = ["path:/api/database/", db, "/schema/", schema].join("");
  const models = ["path:/api/database/", db, "/datasets/", schema].join("");
  const metrics = models;

  return { questions, models, metrics };
}

export function setupCollectionVirtualSchemaEndpoints(
  collection: Collection,
  cards: Card[],
) {
  const urls = getCollectionVirtualSchemaURLs(collection);

  const questionVirtualTables = cards
    .filter(card => card.type === "question")
    .map(convertSavedQuestionToVirtualTable);
  const modelVirtualTables = cards
    .filter(card => card.type === "model")
    .map(convertSavedQuestionToVirtualTable);
  const metricVirtualTables = cards
    .filter(card => card.type === "metric")
    .map(convertSavedQuestionToVirtualTable);

  fetchMock.get(urls.questions, questionVirtualTables);
  fetchMock.get(urls.models, modelVirtualTables);
  fetchMock.get(urls.metrics, metricVirtualTables);
}

export function setupCollectionItemsEndpoint({
  collection,
  collectionItems = [],
  models: modelsParam,
}: {
  collection: Collection;
  collectionItems: CollectionItem[];
  models?: string[];
}) {
  fetchMock.get(`path:/api/collection/${collection.id}/items`, uri => {
    const url = new URL(uri);
    const models = modelsParam ?? url.searchParams.getAll("models");
    const matchedItems = collectionItems.filter(({ model }) =>
      models.includes(model),
    );

    const limit = Number(url.searchParams.get("limit")) || matchedItems.length;
    const offset = Number(url.searchParams.get("offset")) || 0;

    return {
      data: matchedItems.slice(offset, offset + limit),
      total: matchedItems.length,
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

  fetchMock.get(/api\/collection\/\d+$/, url => {
    const collectionIdParam = url.split("/")[5];
    const collectionId = Number(collectionIdParam);

    const collection = collections.find(
      collection => collection.id === collectionId,
    );

    return collection;
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
  fetchMock.get(/api\/collection\/(\d+|root)\/items/, url => {
    const collectionIdParam = url.split("/")[5];
    const collectionId =
      collectionIdParam !== "root" ? Number(collectionIdParam) : null;

    const dashboardsOfCollection = dashboards.filter(
      dashboard => dashboard.collection_id === collectionId,
    );

    return {
      total: dashboardsOfCollection.length,
      data: dashboardsOfCollection,
    };
  });
}
