import type {
  Card,
  Dashboard,
  Document,
  UnreadableCard,
} from "metabase-types/api";

export type ContentOwner =
  | (Pick<Dashboard, "id" | "name"> & { model: "dashboard" })
  | (Pick<Document, "id" | "name" | "collection_id"> & { model: "document" });

export type ContentItem = Card | UnreadableCard;
