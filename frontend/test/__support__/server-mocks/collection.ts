import fetchMock from "fetch-mock";
import _ from "underscore";
import { ROOT_COLLECTION } from "metabase/entities/collections";
import { Card, Collection, Dashboard } from "metabase-types/api";
import {
  convertSavedQuestionToVirtualTable,
  getCollectionVirtualSchemaName,
  SAVED_QUESTIONS_VIRTUAL_DB_ID,
} from "metabase-lib/metadata/utils/saved-questions";
import { PERMISSION_ERROR } from "./constants";

export function setupCollectionsEndpoints(collections: Collection[]) {
  fetchMock.get("path:/api/collection/root", ROOT_COLLECTION);
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

  return { questions, models };
}

export function setupCollectionVirtualSchemaEndpoints(
  collection: Collection,
  cards: Card[],
) {
  const urls = getCollectionVirtualSchemaURLs(collection);

  const [models, questions] = _.partition(cards, card => card.dataset);
  const modelVirtualTables = models.map(convertSavedQuestionToVirtualTable);
  const questionVirtualTables = questions.map(
    convertSavedQuestionToVirtualTable,
  );

  fetchMock.get(urls.questions, questionVirtualTables);
  fetchMock.get(urls.models, modelVirtualTables);
}

export function setupUnauthorizedCollectionEndpoints(collection: Collection) {
  fetchMock.get(`path:/api/collection/${collection.id}`, {
    status: 403,
    body: PERMISSION_ERROR,
  });
}

export function setupUnauthorizedCollectionsEndpoints(
  collections: Collection[],
) {
  collections.forEach(setupUnauthorizedCollectionEndpoints);
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

  fetchMock.get(/api\/collection\/\d+|root/, url => {
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
  fetchMock.get(/api\/collection\/\d+|root/, () => {
    return {
      body: error,
      status,
    };
  });
}

export function setupCollectionItemsEndpoint(dashboards: Dashboard[]) {
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
