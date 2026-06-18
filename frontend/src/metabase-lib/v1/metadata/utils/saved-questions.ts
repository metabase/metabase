import { generateSchemaId } from "metabase-lib/v1/metadata/utils/schema";
import type { CardId, CollectionId, DatabaseId } from "metabase-types/api";

export const SAVED_QUESTIONS_VIRTUAL_DB_ID = -1337;
const ROOT_COLLECTION_VIRTUAL_SCHEMA_NAME = "Everything else";

type VirtualSchemaCollection = {
  id?: CollectionId | null;
  name?: string;
  schemaName?: string;
};

type SavedQuestionCard = {
  id: CardId;
  name: string;
  description?: string | null;
  moderated_status?: string | null;
  dataset_query?: { database?: DatabaseId | null };
  collection?: VirtualSchemaCollection | null;
};

export const ROOT_COLLECTION_VIRTUAL_SCHEMA = getCollectionVirtualSchemaId({
  id: null,
});

export function getCollectionVirtualSchemaName(
  collection?: VirtualSchemaCollection | null,
): string | undefined {
  const isRoot =
    !collection || collection.id === null || collection.id === "root";
  return isRoot
    ? ROOT_COLLECTION_VIRTUAL_SCHEMA_NAME
    : collection.schemaName || collection.name;
}

export function getCollectionVirtualSchemaId(
  collection?: VirtualSchemaCollection | null,
): string {
  const collectionName = getCollectionVirtualSchemaName(collection);
  return generateSchemaId(SAVED_QUESTIONS_VIRTUAL_DB_ID, collectionName);
}

export function getQuestionVirtualTableId(id: string | number): string {
  return `card__${id}`;
}

export function isVirtualCardId(tableId?: unknown): boolean {
  return typeof tableId === "string" && tableId.startsWith("card__");
}

export function getQuestionIdFromVirtualTableId(
  tableId: unknown,
): number | null {
  if (typeof tableId !== "string") {
    return null;
  }
  const id = parseInt(tableId.replace("card__", ""));
  return Number.isSafeInteger(id) ? id : null;
}

export function convertSavedQuestionToVirtualTable(card: SavedQuestionCard) {
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
