import type { ReactNode } from "react";

import { definePluginSlot } from "../slot";

type SchemaViewerPlugin = {
  isEnabled: boolean;
  getDataStudioSchemaViewerRoutes?: () => ReactNode;
};

const getDefaultPluginSchemaViewer = (): SchemaViewerPlugin => ({
  isEnabled: false,
});

export const PLUGIN_SCHEMA_VIEWER = definePluginSlot(
  getDefaultPluginSchemaViewer,
);
