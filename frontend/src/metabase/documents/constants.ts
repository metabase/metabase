import type { DocumentContent } from "metabase-types/api";

export const DOCUMENT_TITLE_MAX_LENGTH = 100;

export const EMPTY_DOCUMENT_CONTENT: DocumentContent = {
  type: "doc",
  content: [],
};
