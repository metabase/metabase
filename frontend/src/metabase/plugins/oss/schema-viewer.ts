import type { ReactNode } from "react";

import { definePluginSlot } from "../slot";

type SchemaViewerPlugin = {
  isEnabled: boolean;
  // Optional, not a no-op default: an OSS build has no plugin to fill this, and
  // the mount reads the absence to put its upsell page in its place.
  getDataStudioSchemaViewerRoutes?: () => ReactNode;
};

const getDefaultPluginSchemaViewer = (): SchemaViewerPlugin => ({
  isEnabled: false,
});

export const PLUGIN_SCHEMA_VIEWER = definePluginSlot(
  getDefaultPluginSchemaViewer,
);
