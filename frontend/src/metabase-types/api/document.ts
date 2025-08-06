import type { Card } from "./card";
import type { CollectionId } from "./collection";

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
};

export type DocumentVersions = Document[];

export type CreateDocumentRequest = Pick<Document, "name"> & {
  document: DocumentContent;
  collection_id?: CollectionId;
  cards?: Record<number, Card>;
};
