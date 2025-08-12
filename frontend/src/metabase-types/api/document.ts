import type { Card } from "./card";
import type { CollectionId } from "./collection";
import type { BaseUser, UserId } from "./user";

export type DocumentId = number;
export type DocumentContent = Record<string, unknown>; // ProseMirror AST

type Creator = {
  common_name: string;
};

export type Document = {
  id: DocumentId;
  creator: Creator;
  document: DocumentContent;
  name: string;
  version: number;
  collection_id: CollectionId;
  created_at: string;
  updated_at: string;
  archived: boolean;
  can_delete: boolean;
  can_restore: boolean;
  can_write: boolean;
  creator_id: UserId;
  creator: BaseUser;
};

export type DocumentVersions = Document[];

export type CreateDocumentRequest = Pick<Document, "name"> & {
  document: DocumentContent;
  collection_id?: CollectionId;
  cards?: Record<number, Card>;
};
