import type { JSONContent } from "@tiptap/core";

import type { Card } from "./card";
import type { Collection, CollectionId } from "./collection";
import type { BaseUser, UserId } from "./user";

export type DocumentId = number;
export type DocumentContent = JSONContent;

export type Document = {
  id: DocumentId;
  creator: BaseUser;
  document: DocumentContent;
  name: string;
  version: number;
  collection_id: CollectionId | null;
  collection_position?: number | null;
  collection?: Collection | null;
  created_at: string;
  updated_at: string;
  archived: boolean;
  is_remote_synced?: boolean;
  can_delete: boolean;
  can_restore: boolean;
  can_write: boolean;
  creator_id: UserId;
  public_uuid?: string | null;
  made_public_by_id?: UserId | null;
  cards?: Record<number, Card>; // Map of card ID -> card metadata, hydrated for public documents
  view_count?: number;
};

export type GetDocumentRequest = { id: DocumentId };

export type DocumentCardRequest = Pick<
  Card,
  | "name"
  | "dataset_query"
  | "display"
  | "visualization_settings"
  | "description"
  | "parameters"
  | "parameter_mappings"
  | "result_metadata"
  | "cache_ttl"
>;

export type CreateDocumentRequest = Pick<Document, "name"> & {
  document: DocumentContent;
  collection_id?: CollectionId;
  collection_position?: number | null;
  cards?: Record<number, DocumentCardRequest>;
};

export type UpdateDocumentRequest = {
  id: DocumentId;
  name?: string;
  document?: DocumentContent;
  collection_id?: CollectionId | null;
  collection_position?: number | null;
  cards?: Record<number, DocumentCardRequest>;
  archived?: boolean;
};

export type DeleteDocumentRequest = Pick<Document, "id">;

export type CopyDocumentRequest = {
  id: DocumentId;
  name?: string | null;
  collection_id?: CollectionId | null;
  collection_position?: number | null;
};

export type GetPublicDocument = Pick<Document, "id" | "name" | "public_uuid">;
