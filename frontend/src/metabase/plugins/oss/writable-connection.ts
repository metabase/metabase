import type { ComponentType, ReactNode } from "react";

import type { Database } from "metabase-types/api";

import { PluginPlaceholder } from "../components/PluginPlaceholder";
import { definePluginSlot } from "../slot";

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
