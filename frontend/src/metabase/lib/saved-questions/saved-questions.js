import { t } from "ttag";

export const SAVED_QUESTIONS_VIRTUAL_DB_ID = -1337;
export const ROOT_COLLECTION_VIRTUAL_SCHEMA_NAME = t`Everything else`;

export const ROOT_COLLECTION_VIRTUAL_SCHEMA = getCollectionVirtualSchemaId({
  id: null,
});

export function getCollectionVirtualSchemaName(collection) {
  return !collection || collection.id === null
    ? ROOT_COLLECTION_VIRTUAL_SCHEMA_NAME
    : collection.name;
}

export function getCollectionVirtualSchemaId(collection) {
  const collectionName = getCollectionVirtualSchemaName(collection);
  return `${SAVED_QUESTIONS_VIRTUAL_DB_ID}:${collectionName}`;
}

export function getQuestionVirtualTableId(card) {
  return `card__${card.id}`;
}

export function convertSavedQuestionToVirtualTable(card) {
  return {
    id: getQuestionVirtualTableId(card),
    display_name: card.name,
    description: card.description,
    moderated_status: card.moderated_status,
    db_id: card.dataset_query.database,
    schema: getCollectionVirtualSchemaId(card.collection),
    schema_name: getCollectionVirtualSchemaName(card.collection),
  };
}
