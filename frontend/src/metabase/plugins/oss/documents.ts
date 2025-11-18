import type React from "react";

import type { Document } from "metabase-types/api";

const getDefaultPluginDocuments = () => ({
  getRoutes: () => null as React.ReactElement | null,
  shouldShowDocumentInNewItemMenu: () => false,
  getCurrentDocument: (_state: any) => null as Document | null,
  getSidebarOpen: (_state: any) => false,
  getCommentSidebarOpen: (_state: any) => false,
  DocumentCopyForm: (_props: any) => null as React.ReactElement | null,
});

export const PLUGIN_DOCUMENTS = getDefaultPluginDocuments();

export function reinitialize() {
  Object.assign(PLUGIN_DOCUMENTS, getDefaultPluginDocuments());
}
