import { generateSchemaId } from "metabase-lib/v1/metadata/utils/schema";

export const SAVED_QUESTIONS_VIRTUAL_DB_ID = -1337;
const ROOT_COLLECTION_VIRTUAL_SCHEMA_NAME = "Everything else";

export const ROOT_COLLECTION_VIRTUAL_SCHEMA = getCollectionVirtualSchemaId({
  id: null,
});

export function getCollectionVirtualSchemaName(collection) {
  const isRoot =
    !collection || collection.id === null || collection.id === "root";
  return isRoot
    ? ROOT_COLLECTION_VIRTUAL_SCHEMA_NAME
    : collection.schemaName || collection.name;
}

export function getCollectionVirtualSchemaId(collection, { isDatasets } = {}) {
  const collectionName = getCollectionVirtualSchemaName(collection);
  return generateSchemaId(
    SAVED_QUESTIONS_VIRTUAL_DB_ID,
    collectionName,
    isDatasets ? { isDatasets } : undefined,
  );
}

export function getRootCollectionVirtualSchemaId({ isModels }) {
  return getCollectionVirtualSchemaId(null, { isDatasets: isModels });
}

export function getQuestionVirtualTableId(id) {
  return `card__${id}`;
}

export function isVirtualCardId(tableId) {
  return typeof tableId === "string" && tableId.startsWith("card__");
}

export function getQuestionIdFromVirtualTableId(tableId) {
  if (typeof tableId !== "string") {
    return null;
  }
  const id = parseInt(tableId.replace("card__", ""));
  return Number.isSafeInteger(id) ? id : null;
}

export function convertSavedQuestionToVirtualTable(card) {
  return {
    id: getQuestionVirtualTableId(card.id),
    display_name: card.name,
    description: card.description,
    moderated_status: card.moderated_status,
    db_id: card.dataset_query.database,
    schema: getCollectionVirtualSchemaId(card.collection),
    schema_name: getCollectionVirtualSchemaName(card.collection),
  };
}
