import { generateSchemaId } from "metabase-lib/v1/metadata/utils/schema";
import type {
  Card,
  CardId,
  Collection,
  Table,
  TableId,
  WrappedCardId,
} from "metabase-types/api";

export const SAVED_QUESTIONS_VIRTUAL_DB_ID = -1337;
const ROOT_COLLECTION_VIRTUAL_SCHEMA_NAME = "Everything else";

export const ROOT_COLLECTION_VIRTUAL_SCHEMA = getCollectionVirtualSchemaId({
  id: null,
});

export function getCollectionVirtualSchemaName(collection: Collection) {
  const isRoot =
    !collection || collection.id === null || collection.id === "root";
  return isRoot
    ? ROOT_COLLECTION_VIRTUAL_SCHEMA_NAME
    : collection.schemaName || collection.name;
}

export function getCollectionVirtualSchemaId(collection: Collection) {
  const collectionName = getCollectionVirtualSchemaName(collection);
  return generateSchemaId(SAVED_QUESTIONS_VIRTUAL_DB_ID, collectionName);
}

export function getQuestionVirtualTableId(id: CardId): WrappedCardId {
  return `card__${id}`;
}

export function isVirtualCardId(
  id: TableId | WrappedCardId | null,
): id is WrappedCardId {
  return typeof id === "string" && id.startsWith("card__");
}

export function getQuestionIdFromVirtualTableId(tableId: null): null;
export function getQuestionIdFromVirtualTableId(tableId: TableId | null): null;
export function getQuestionIdFromVirtualTableId(tableId: WrappedCardId): CardId;
export function getQuestionIdFromVirtualTableId(
  tableId: TableId | WrappedCardId | null,
): CardId | null;
export function getQuestionIdFromVirtualTableId(
  tableId: TableId | WrappedCardId | null,
): CardId | null {
  if (typeof tableId !== "string") {
    return null;
  }
  const id = parseInt(tableId.replace("card__", ""));
  if (!Number.isSafeInteger(id)) {
    throw new Error(`Invalid virtual table id: ${tableId}`);
  }
  return id;
}

export function convertSavedQuestionToVirtualTable(card: Card): Table {
  // TODO(romeovs): remove this helper
  return {
    id: getQuestionVirtualTableId(card.id),
    display_name: card.name,
    description: card.description,
    moderated_status: card.moderated_status,
    // we may not have permissions
    db_id: card.dataset_query?.database,
    type: "question",
    schema: getCollectionVirtualSchemaId(card.collection),
    schema_name: getCollectionVirtualSchemaName(card.collection),
  };
}
