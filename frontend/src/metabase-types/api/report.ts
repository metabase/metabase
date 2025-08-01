import type { CollectionId } from "./collection";

export type DocumentId = number;

export type Document = {
  id: DocumentId;
  document: string;
  name: string;
  version: number;
  collection_id: CollectionId;
  created_at: string;
  updated_at: string;
};

export type DocumentVersions = Document[];

export type CreateDocumentRequest = Pick<Document, "name" | "document"> & {
  collection_id?: CollectionId;
  used_card_ids?: number[];
};
