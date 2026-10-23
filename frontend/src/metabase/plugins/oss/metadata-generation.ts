import type { ComponentType } from "react";

import type { DatabaseId, FieldId, Table, TableId } from "metabase-types/api";

import { definePluginSlot } from "../slot";

export type MetadataGenerationDatabaseButtonProps = {
  databaseId: DatabaseId;
};

export type MetadataGenerationTableButtonProps = {
  table: Table;
};

export type MetadataGenerationPendingBadgeProps = {
  tableId: TableId;
  /** When given, the badge counts the pending suggestions of this field only. */
  fieldId?: FieldId;
  /** Whether the pane reads the pending suggestions as if accepted. */
  isPreview: boolean;
  onPreviewChange: (isPreview: boolean) => void;
};

type MetadataGenerationPlugin = {
  /** The "Generate metadata" button of the database details panel. */
  DatabaseButton: ComponentType<MetadataGenerationDatabaseButtonProps>;
  TableButton: ComponentType<MetadataGenerationTableButtonProps>;
  /** The pending AI suggestions of a table or field pane, with the preview toggle. Nothing when there are none. */
  PendingBadge: ComponentType<MetadataGenerationPendingBadgeProps>;
};

const getDefaultPluginMetadataGeneration = (): MetadataGenerationPlugin => ({
  DatabaseButton: () => null,
  TableButton: () => null,
  PendingBadge: () => null,
});

export const PLUGIN_METADATA_GENERATION = definePluginSlot(
  getDefaultPluginMetadataGeneration,
);
