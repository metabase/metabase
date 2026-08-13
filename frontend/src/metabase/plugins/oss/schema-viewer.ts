import type { ReactNode } from "react";

type SchemaViewerPlugin = {
  isEnabled: boolean;
  getDataStudioSchemaViewerRoutes: () => ReactNode;
};

const getDefaultPluginSchemaViewer = (): SchemaViewerPlugin => ({
  isEnabled: false,
  getDataStudioSchemaViewerRoutes: () => null,
});

export const PLUGIN_SCHEMA_VIEWER = getDefaultPluginSchemaViewer();

/**
 * @internal Do not call directly. Use the main reinitialize function from metabase/plugins instead.
 */
export function reinitialize() {
  Object.assign(PLUGIN_SCHEMA_VIEWER, getDefaultPluginSchemaViewer());
}
