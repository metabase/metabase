import type { ComponentType, ReactNode } from "react";

import { definePluginSlot } from "metabase/plugin-slots";
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

export const PLUGIN_WRITABLE_CONNECTION = definePluginSlot(
  getDefaultWritableConnection,
);
