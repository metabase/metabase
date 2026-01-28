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
  currentUserId?: number;
}

export function setupCollectionsEndpoints({
  collections,
  rootCollection = createMockCollection(ROOT_COLLECTION),
  trashCollection = mockTrashCollection,
  currentUserId,
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
    "path:/api/collection",
    (call) => {
      const url = new URL(call.url);

      const excludeOtherUserCollections =
        url.searchParams.get("exclude-other-user-collections") === "true";

      return collections.filter((collection) => {
        // Filter out other users' personal collections if requested
        // But keep the current user's personal collection
        if (
          excludeOtherUserCollections &&
          typeof collection.personal_owner_id === "number" &&
          collection.personal_owner_id !== currentUserId
        ) {
          return false;
        }

        return true;
      });
    },
    {
      name: "collection-list",
    },
  );

  fetchMock.get("path:/api/collection/tree", (call) => {
    const url = new URL(call.url);
    const excludeArchived = url.searchParams.get("exclude-archived") === "true";

    const excludeOtherUserCollections =
      url.searchParams.get("exclude-other-user-collections") === "true";

    // Support both singular "namespace" and plural "namespaces" params
    const namespace = url.searchParams.get("namespace");
    const namespaces = url.searchParams.getAll("namespaces");
    const requestedNamespaces =
      namespaces.length > 0 ? namespaces : namespace ? [namespace] : null;

    return collections.filter((collection) => {
      // Filter out other users' personal collections if requested
      // But keep the current user's personal collection
      if (
        excludeOtherUserCollections &&
        typeof collection.personal_owner_id === "number" &&
        collection.personal_owner_id !== currentUserId
      ) {
        return false;
      }

      // Filter out archived collections if requested
      if (excludeArchived && collection.archived) {
        return false;
      }

      // Filter by namespace(s) if specified
      if (requestedNamespaces) {
        const collectionNamespace = collection.namespace ?? "";
        if (!requestedNamespaces.includes(collectionNamespace)) {
          return false;
        }
      } else {
        // By default, exclude tenant collections unless explicitly requested via namespace
        const isTenantCollection =
          collection.namespace === "shared-tenant-collection";
        if (isTenantCollection) {
          return false;
        }
      }

      return true;
    });
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

function handleCollectionItemsResponse({
  call,
  collectionItems,
  modelsParam,
}: {
  call: { url: string };
  collectionItems: CollectionItem[];
  modelsParam?: string[];
}) {
  const url = new URL(call.url);
  const models = modelsParam ?? url.searchParams.getAll("models");

  // When the models filter is an empty array, return all items.
  // In the API, omitting the `models` param returns all collection items.
  const matchedItems =
    models.length === 0
      ? collectionItems
      : collectionItems.filter(({ model }) => models.includes(model));

  const limit = Number(url.searchParams.get("limit")) || matchedItems.length;
  const offset = Number(url.searchParams.get("offset")) || 0;

  return {
    data: matchedItems.slice(offset, offset + limit),
    total: matchedItems.length,
    models,
    limit,
    offset,
  };
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
      return handleCollectionItemsResponse({
        call,
        collectionItems,
        modelsParam,
      });
    },
    { name: `collection-${collection.id}-items` },
  );
}

export function setupTenantCollectionItemsEndpoint({
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
    (call: { url: string }) => {
      // Check if this is a tenant collection request
      if (call.url.includes("namespace=shared-tenant-collection")) {
        return handleCollectionItemsResponse({
          call,
          collectionItems,
          modelsParam,
        });
      }

      throw new Error("MOCK_SKIP");
    },
    {
      name: `tenant-collection-${collection.id}-items`,
    },
  );
}

export function setupRootCollectionItemsEndpoint({
  rootCollectionItems,
  tenantRootItems = [],
}: {
  rootCollectionItems: CollectionItem[];
  tenantRootItems?: CollectionItem[];
}) {
  fetchMock.get(
    `path:/api/collection/root/items`,
    (call: { url: string }) => {
      const url = new URL(call.url);
      const models = url.searchParams.getAll("models");

      // Check if it's a tenant request
      if (call.url.includes("namespace=shared-tenant-collection")) {
        return {
          data: tenantRootItems,
          total: tenantRootItems.length,
          models,
          limit: null,
          offset: null,
        };
      }

      return {
        data: rootCollectionItems,
        total: rootCollectionItems.length,
        models,
        limit: null,
        offset: null,
      };
    },
    { name: "root-collection-items" },
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
  fetchMock.get(/api\/collection\/\d+|root$/, {
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

export function setupCreateCollectionEndpoint(
  collection: Collection = createMockCollection(),
) {
  fetchMock.post("path:/api/collection", collection, {
    name: "create-collection",
  });
}

export function setupUpdateCollectionEndpoint(collection: Collection) {
  fetchMock.put(`path:/api/collection/${collection.id}`, collection, {
    name: `update-collection-${collection.id}`,
  });
}

export function setupDeleteCollectionEndpoint(collectionId: number) {
  fetchMock.delete(
    `path:/api/collection/${collectionId}`,
    { success: true },
    {
      name: `delete-collection-${collectionId}`,
    },
  );
}

export function setupGetCollectionEndpoint(collection: Collection) {
  fetchMock.get(`path:/api/collection/${collection.id}`, collection, {
    name: `get-collection-${collection.id}`,
  });
}

/**
 * Setup a simple collection tree endpoint that returns collections without filtering.
 * Use this when you need to test components that use useListCollectionsTreeQuery
 * without the complexity of namespace filtering.
 */
export function setupCollectionTreeEndpoint(collections: Collection[]) {
  fetchMock.removeRoute("collection-tree-simple");
  fetchMock.get("path:/api/collection/tree", collections, {
    name: "collection-tree-simple",
  });
}
