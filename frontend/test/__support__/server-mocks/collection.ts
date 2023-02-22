import fetchMock from "fetch-mock";
import _ from "underscore";
import { ROOT_COLLECTION } from "metabase/entities/collections";
import { Card, Collection } from "metabase-types/api";
import {
  convertSavedQuestionToVirtualTable,
  getCollectionVirtualSchemaName,
  SAVED_QUESTIONS_VIRTUAL_DB_ID,
} from "metabase-lib/metadata/utils/saved-questions";

export function setupCollectionsEndpoints(collections: Collection[]) {
  fetchMock.get("path:/api/collection", collections);
  fetchMock.get("path:/api/collection/tree?tree=true", collections);
  fetchMock.get(
    "path:/api/collection/tree?tree=true&exclude-archived=true",
    collections.filter(collection => !collection.archived),
  );
  fetchMock.get("path:/api/collection/root", ROOT_COLLECTION);
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
