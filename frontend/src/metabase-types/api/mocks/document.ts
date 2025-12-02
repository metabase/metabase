import { uuid } from "metabase/lib/uuid";
import type { Document, DocumentContent } from "metabase-types/api";

import { createMockUser } from "./user";

export const createMockDocument = (opts?: Partial<Document>): Document => ({
  id: 1,
  name: "Test Document",
  creator: createMockUser(),
  creator_id: 1,
  document: createMockDocumentContent(),
  version: 1,
  collection_id: null,
  created_at: "2024-01-01T10:30:00Z",
  updated_at: "2024-01-15T10:30:00Z",
  archived: false,
  can_delete: true,
  can_restore: true,
  can_write: true,
  ...opts,
});

export const createMockDocumentContent = (
  opts?: Partial<DocumentContent>,
): DocumentContent => ({
  type: "doc",
  content: [],
  ...opts,
});

export const createMockDocumentContentParagraph = (
  text: string,
): DocumentContent => ({
  type: "paragraph",
  attrs: {
    _id: uuid(),
  },
  content: [{ type: "text", text }],
});
