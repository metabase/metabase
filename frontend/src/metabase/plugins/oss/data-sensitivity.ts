import type { ComponentType } from "react";

import { PluginPlaceholder } from "metabase/plugins/components/PluginPlaceholder";
import type { Database } from "metabase-types/api";

import { definePluginSlot } from "../slot";

export type DataSensitivityDatabaseSectionProps = {
  database: Database;
};

type PluginDataSensitivity = {
  DatabaseSection: ComponentType<DataSensitivityDatabaseSectionProps>;
};

const getDefaultPluginDataSensitivity = (): PluginDataSensitivity => ({
  DatabaseSection: PluginPlaceholder,
});

export const PLUGIN_DATA_SENSITIVITY = definePluginSlot(
  getDefaultPluginDataSensitivity,
);
