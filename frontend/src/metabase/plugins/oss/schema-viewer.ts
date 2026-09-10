import type { ReactNode } from "react";

import { definePluginSlot } from "../slot";

type SchemaViewerPlugin = {
  isEnabled: boolean;
  getDataStudioSchemaViewerRoutes: () => ReactNode;
};

const getDefaultPluginSchemaViewer = (): SchemaViewerPlugin => ({
  isEnabled: false,
  getDataStudioSchemaViewerRoutes: () => null,
});

export const PLUGIN_SCHEMA_VIEWER = definePluginSlot(
  getDefaultPluginSchemaViewer,
);
