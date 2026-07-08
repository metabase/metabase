import type { ComponentType, ReactNode } from "react";

import type { Database } from "metabase-types/api";

import { PluginPlaceholder } from "../components/PluginPlaceholder";

export type WritableConnectionInfoSectionProps = {
  database: Database;
};

const getDefaultWritableConnection = () => ({
  getWritableConnectionInfoRoutes: (_IsAdmin: ComponentType): ReactNode => null,
  WritableConnectionInfoSection:
    PluginPlaceholder<WritableConnectionInfoSectionProps>,
});

export const PLUGIN_WRITABLE_CONNECTION = getDefaultWritableConnection();

/**
 * @internal Do not call directly. Use the main reinitialize function from metabase/plugins instead.
 */
export function reinitialize() {
  Object.assign(PLUGIN_WRITABLE_CONNECTION, getDefaultWritableConnection());
}
