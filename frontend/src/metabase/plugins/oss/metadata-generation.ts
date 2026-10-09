import type { ComponentType } from "react";

import type { DatabaseId, Table } from "metabase-types/api";

import { definePluginSlot } from "../slot";

export type MetadataGenerationDatabasePaneProps = {
  databaseId: DatabaseId;
};

export type MetadataGenerationTableButtonProps = {
  table: Table;
};

type MetadataGenerationPlugin = {
  isEnabled: boolean;
  DatabasePane: ComponentType<MetadataGenerationDatabasePaneProps>;
  TableButton: ComponentType<MetadataGenerationTableButtonProps>;
};

const getDefaultPluginMetadataGeneration = (): MetadataGenerationPlugin => ({
  isEnabled: false,
  DatabasePane: () => null,
  TableButton: () => null,
});

export const PLUGIN_METADATA_GENERATION = definePluginSlot(
  getDefaultPluginMetadataGeneration,
);
