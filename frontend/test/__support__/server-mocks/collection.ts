import type { Scope } from "nock";
import _ from "underscore";
import { ROOT_COLLECTION } from "metabase/entities/collections";
import { Card, Collection } from "metabase-types/api";
import {
  convertSavedQuestionToVirtualTable,
  getCollectionVirtualSchemaName,
  SAVED_QUESTIONS_VIRTUAL_DB_ID,
} from "metabase-lib/metadata/utils/saved-questions";

export function setupCollectionsEndpoints(
  scope: Scope,
  collections: Collection[],
) {
  scope.get("/api/collection").reply(200, collections);
  scope.get("/api/collection/tree?tree=true").reply(200, collections);
  scope.get("/api/collection/tree?tree=true&exclude-archived=true").reply(
    200,
    collections.filter(collection => !collection.archived),
  );
  scope.get("/api/collection/root").reply(200, ROOT_COLLECTION);
}

function getCollectionVirtualSchemaURLs(collection: Collection) {
  const db = SAVED_QUESTIONS_VIRTUAL_DB_ID;
  const schemaName = getCollectionVirtualSchemaName(collection);
  const schema = encodeURIComponent(schemaName);

  const questions = ["/api/database/", db, "/schema/", schema].join("");
  const models = ["/api/database/", db, "/datasets/", schema].join("");

  return { questions, models };
}

export function setupCollectionVirtualSchemaEndpoints(
  scope: Scope,
  collection: Collection,
  cards: Card[],
) {
  const urls = getCollectionVirtualSchemaURLs(collection);

  const [models, questions] = _.partition(cards, card => card.dataset);
  const modelVirtualTables = models.map(convertSavedQuestionToVirtualTable);
  const questionVirtualTables = questions.map(
    convertSavedQuestionToVirtualTable,
  );

  scope.get(urls.questions).reply(200, questionVirtualTables);
  scope.get(urls.models).reply(200, modelVirtualTables);
}
