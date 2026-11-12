import type React from "react";
import type { JSX } from "react";
import { t } from "ttag";

import type { CollectionInstanceAnaltyicsConfig } from "metabase/common/collections/types";
import { PluginPlaceholder } from "metabase/plugins/components/PluginPlaceholder";
import type { IconProps } from "metabase/ui";
import type {
  BaseEntityId,
  Collection,
  CollectionEssentials,
  CollectionId,
} from "metabase-types/api";

import { definePluginSlot } from "../slot";

// Types
export type ItemWithCollection = { collection: CollectionEssentials };

type GetCollectionIdType = (
  sourceCollectionId?: CollectionId | null,
  options?: { disabled?: boolean },
) => CollectionId | null;

type CollectionInstanceAnalyticsIcon = React.ComponentType<
  Omit<IconProps, "name"> & {
    collection: Collection;
    entity: "collection" | "question" | "model" | "dashboard" | "metric";
  }
>;

const REGULAR_COLLECTION: CollectionInstanceAnaltyicsConfig = {
  type: null,
  get name() {
    return t`Regular`;
  },
  icon: "folder",
};

const getDefaultPluginCollections = () => ({
  getCollectionType: (
    _collection: Partial<Collection>,
  ): CollectionInstanceAnaltyicsConfig => REGULAR_COLLECTION,
  // Unjustified type cast. FIXME
  useGetDefaultCollectionId: null as GetCollectionIdType | null,
  // Unjustified type cast. FIXME
  CUSTOM_INSTANCE_ANALYTICS_COLLECTION_ENTITY_ID: "" as BaseEntityId | "",
  getInstanceAnalyticsAdminReadonlyMessage: () =>
    // eslint-disable-next-line metabase/no-literal-metabase-strings -- This string only shows for admins.
    t`Administrators always have the highest level of access to everything in Metabase.`,
  filterOutItemsFromInstanceAnalytics: <Item extends ItemWithCollection>(
    items: Item[],
  ) => items,
  // Unjustified type cast. FIXME
  canCleanUp: (_collection: Collection) => false as boolean,
  useGetCleanUpMenuItems: (
    _collection: Collection,
  ): { menuItems: JSX.Element[] } => ({
    menuItems: [],
  }),
  // Unjustified type cast. FIXME
  cleanUpRoute: null as React.ReactElement | null,
  // Unjustified type cast. FIXME
  cleanUpAlert: (() => null) as (props: {
    collection: Collection;
  }) => JSX.Element | null,
});

export const PLUGIN_COLLECTIONS = definePluginSlot(getDefaultPluginCollections);

const getDefaultPluginCollectionComponents = () => ({
  CollectionInstanceAnalyticsIcon:
    // Unjustified type cast. FIXME
    PluginPlaceholder as CollectionInstanceAnalyticsIcon,
});

export const PLUGIN_COLLECTION_COMPONENTS = definePluginSlot(
  getDefaultPluginCollectionComponents,
);
