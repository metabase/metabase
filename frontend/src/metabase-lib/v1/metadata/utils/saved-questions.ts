import { generateSchemaId } from "metabase-lib/v1/metadata/utils/schema";
import type {
  Card,
  CardId,
  Collection,
  ModerationReviewStatus,
  TableId,
  VirtualCardId,
} from "metabase-types/api";

export const SAVED_QUESTIONS_VIRTUAL_DB_ID = -1337;
const ROOT_COLLECTION_VIRTUAL_SCHEMA_NAME = "Everything else";

// Subset of a collection used to derive its virtual schema. `schemaName` only
// exists on enriched collection-tree items; plain Collections fall back to `name`.
type VirtualSchemaCollection = {
  id?: Collection["id"] | null;
  name: Collection["name"];
  schemaName?: string;
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

export function getQuestionVirtualTableId(id: string | number): string {
  return `card__${id}`;
}

export function isVirtualCardId(
  tableId?: TableId | null,
): tableId is VirtualCardId {
  return typeof tableId === "string" && /^card__\d+$/.test(tableId);
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

// Cards carry `moderation_reviews`, not a denormalized `moderated_status`.
export function getCardModeratedStatus(
  card: Pick<Card, "moderation_reviews">,
): ModerationReviewStatus {
  return (
    card.moderation_reviews?.find((review) => review.most_recent)?.status ??
    null
  );
}

export function convertSavedQuestionToVirtualTable(
  card: Pick<
    Card,
    | "id"
    | "name"
    | "description"
    | "collection"
    | "database_id"
    | "moderation_reviews"
  >,
) {
  return {
    id: getQuestionVirtualTableId(card.id),
    display_name: card.name,
    description: card.description,
    moderated_status: getCardModeratedStatus(card),
    db_id: card.database_id,
    type: "question",
    schema: getCollectionVirtualSchemaId(card.collection),
    schema_name: getCollectionVirtualSchemaName(card.collection),
  };
}
