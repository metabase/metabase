import type { JSONContent } from "@tiptap/core";

import type { Card } from "./card";
import type { CollectionId } from "./collection";
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
  created_at: string;
  updated_at: string;
  archived: boolean;
  can_delete: boolean;
  can_restore: boolean;
  can_write: boolean;
  creator_id: UserId;
};

export type GetDocumentRequest = { id: DocumentId };

export type CreateDocumentRequest = Pick<Document, "name"> & {
  document: DocumentContent;
  collection_id?: CollectionId;
  cards?: Record<number, Card>;
};

export type UpdateDocumentRequest = Pick<Document, "id"> &
  Partial<Omit<Document, "id">>;

export type DeleteDocumentRequest = Pick<Document, "id">;
