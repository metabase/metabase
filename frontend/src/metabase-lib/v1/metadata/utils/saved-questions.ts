import { generateSchemaId } from "metabase-lib/v1/metadata/utils/schema";
import type {
  Card,
  CardId,
  Collection,
  ModerationReviewStatus,
  SchemaName,
  TableId,
  VirtualTableId,
} from "metabase-types/api";

export const SAVED_QUESTIONS_VIRTUAL_DB_ID = -1337;
const ROOT_COLLECTION_VIRTUAL_SCHEMA_NAME = "Everything else";

// Subset of a collection used to derive its virtual schema. `schemaName` only
// exists on enriched collection-tree items; plain Collections fall back to `name`.
type VirtualSchemaCollection = {
  id?: Collection["id"] | null;
  name: Collection["name"];
  schemaName?: SchemaName;
};

export const ROOT_COLLECTION_VIRTUAL_SCHEMA = generateSchemaId(
  SAVED_QUESTIONS_VIRTUAL_DB_ID,
  ROOT_COLLECTION_VIRTUAL_SCHEMA_NAME,
);

export function getCollectionVirtualSchemaName(
  collection?: VirtualSchemaCollection | null,
): string {
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

export function getQuestionVirtualTableId(id: CardId | string): VirtualTableId {
  return `card__${id}`;
}

export function isVirtualCardId(
  tableId?: TableId | null,
): tableId is VirtualTableId {
  return typeof tableId === "string" && tableId.startsWith("card__");
}

export function getQuestionIdFromVirtualTableId(
  tableId?: TableId | null,
): CardId | null {
  if (typeof tableId !== "string") {
    return null;
  }
  const id = parseInt(tableId.replace("card__", ""));
  return Number.isSafeInteger(id) ? id : null;
}

// The card fields this conversion reads. `moderated_status` is a hydrated extra
// present on some API payloads but not on the Card type itself.
type ConvertibleCard = Pick<
  Card,
  "id" | "name" | "description" | "collection" | "dataset_query"
> & {
  moderated_status?: ModerationReviewStatus;
};

export function convertSavedQuestionToVirtualTable(card: ConvertibleCard) {
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
