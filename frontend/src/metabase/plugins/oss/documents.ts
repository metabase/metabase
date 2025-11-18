import type React from "react";

import type { Document } from "metabase-types/api";

export const PLUGIN_DOCUMENTS = {
  getRoutes: () => null as React.ReactElement | null,
  shouldShowDocumentInNewItemMenu: () => false,
  getCurrentDocument: (_state: any) => null as Document | null,
  getSidebarOpen: (_state: any) => false,
  getCommentSidebarOpen: (_state: any) => false,
  DocumentCopyForm: (_props: any) => null as React.ReactElement | null,
};
