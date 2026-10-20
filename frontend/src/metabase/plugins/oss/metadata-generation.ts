import type { ComponentType } from "react";

import type { DatabaseId, Table } from "metabase-types/api";

import { definePluginSlot } from "../slot";

export type MetadataGenerationDatabaseButtonProps = {
  databaseId: DatabaseId;
};

export type MetadataGenerationTableButtonProps = {
  table: Table;
};

type MetadataGenerationPlugin = {
  isEnabled: boolean;
  /** The "Generate metadata" button of the database details panel. */
  DatabaseButton: ComponentType<MetadataGenerationDatabaseButtonProps>;
  TableButton: ComponentType<MetadataGenerationTableButtonProps>;
};

const getDefaultPluginMetadataGeneration = (): MetadataGenerationPlugin => ({
  isEnabled: false,
  DatabaseButton: () => null,
  TableButton: () => null,
});

export const PLUGIN_METADATA_GENERATION = definePluginSlot(
  getDefaultPluginMetadataGeneration,
);
