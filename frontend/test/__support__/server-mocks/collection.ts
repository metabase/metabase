import fetchMock from "fetch-mock";
import _ from "underscore";
import { ROOT_COLLECTION } from "metabase/entities/collections";
import { Card, Collection, CollectionItem } from "metabase-types/api";
import {
  convertSavedQuestionToVirtualTable,
  getCollectionVirtualSchemaName,
  SAVED_QUESTIONS_VIRTUAL_DB_ID,
} from "metabase-lib/metadata/utils/saved-questions";

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

export function setupCollectionItemsEndpoint(
  collection: Collection,
  collectionItems: CollectionItem[] = [],
) {
  fetchMock.get(`path:/api/collection/${collection.id}/items`, uri => {
    const url = new URL(uri);
    const models = url.searchParams.getAll("models");
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
