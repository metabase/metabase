import type { Card } from "./card";
import type { CollectionId } from "./collection";
import type { BaseUser, UserId } from "./user";

export type DocumentId = number;
export type DocumentContent = Record<string, unknown>; // ProseMirror AST

export type Document = {
  id: DocumentId;
  document: DocumentContent;
  name: string;
  version: number;
  collection_id: CollectionId;
  created_at: string;
  updated_at: string;
  can_write: boolean;
  creator_id: UserId;
  creator: BaseUser;
};

export type GetDocumentRequest = { id: DocumentId };

export type CreateDocumentRequest = Pick<Document, "name"> & {
  document: DocumentContent;
  collection_id?: CollectionId;
  cards?: Record<number, Card>;
};

export type UpdateDocumentRequest = Pick<Document, "id" | "name"> & {
  document?: DocumentContent;
  cards?: Record<number, Card>;
};
