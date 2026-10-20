import type { Editor, Extensions } from "@tiptap/core";
import type { ReactNode } from "react";

import type { DocumentContent } from "metabase-types/api";

import type { DocumentEditorHost } from "./Editor/DocumentEditorHost";

export type DocumentPageAddonArgs = {
  editor: Editor | null;
  canWrite: boolean;
  savedContent: DocumentContent | null | undefined;
};

/** What a feature adds to the document page: editor nodes, slash-menu commands, and a side panel. */
export type DocumentPageAddon = {
  extraExtensions?: Extensions;
  hostOverride?: Partial<DocumentEditorHost>;
  /** Wraps the page, e.g. in the providers the extensions read. */
  wrap: (children: ReactNode) => ReactNode;
  sidePanel: ReactNode;
};

export type UseDocumentPageAddon = (
  args: DocumentPageAddonArgs,
) => DocumentPageAddon;

const NO_DOCUMENT_PAGE_ADDON: DocumentPageAddon = {
  wrap: (children) => children,
  sidePanel: null,
};

export const useNoDocumentPageAddon: UseDocumentPageAddon = () =>
  NO_DOCUMENT_PAGE_ADDON;
