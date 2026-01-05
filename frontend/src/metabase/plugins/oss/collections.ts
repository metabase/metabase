import type React from "react";
import type { ComponentType } from "react";
import { t } from "ttag";

import { Messages } from "metabase/admin/permissions/constants/messages";
import { getIconBase } from "metabase/lib/icon";
import { PluginPlaceholder } from "metabase/plugins/components/PluginPlaceholder";
import type { IconProps } from "metabase/ui";
import type {
  BaseEntityId,
  Bookmark,
  Collection,
  CollectionAuthorityLevelConfig,
  CollectionEssentials,
  CollectionId,
  CollectionInstanceAnaltyicsConfig,
} from "metabase-types/api";

// Types
export type ItemWithCollection = { collection: CollectionEssentials };

type GetCollectionIdType = (
  sourceCollectionId?: CollectionId | null,
) => CollectionId | null;

export type CollectionAuthorityLevelDisplayProps = {
  collection: Collection;
};

export type CollectionAuthorityLevelIcon = ComponentType<
  Omit<IconProps, "name" | "tooltip"> & {
    collection: Pick<Collection, "authority_level">;
    tooltip?: "default" | "belonging";
    archived?: boolean;
  }
>;

type CollectionInstanceAnalyticsIcon = React.ComponentType<
  Omit<IconProps, "name"> & {
    collection: Collection;
    entity: "collection" | "question" | "model" | "dashboard" | "metric";
  }
>;

type FormCollectionAuthorityLevelPicker = React.ComponentType<
  React.HTMLAttributes<HTMLDivElement> & { name: string; title?: string }
>;

const AUTHORITY_LEVEL_REGULAR: CollectionAuthorityLevelConfig = {
  type: null,
  get name() {
    return t`Regular`;
  },
  icon: "folder",
};

const getDefaultPluginCollections = () => ({
  AUTHORITY_LEVEL: {
    [JSON.stringify(AUTHORITY_LEVEL_REGULAR.type)]: AUTHORITY_LEVEL_REGULAR,
  },
  COLLECTION_TYPES: {
    [JSON.stringify(AUTHORITY_LEVEL_REGULAR.type)]: AUTHORITY_LEVEL_REGULAR,
  },
  REGULAR_COLLECTION: AUTHORITY_LEVEL_REGULAR,
  isRegularCollection: (_data: Partial<Collection> | Bookmark) => true,
  isSyncedCollection: (_data: Partial<Collection>) => false,
  getCollectionType: (
    _collection: Partial<Collection>,
  ): CollectionAuthorityLevelConfig | CollectionInstanceAnaltyicsConfig =>
    AUTHORITY_LEVEL_REGULAR,
  useGetDefaultCollectionId: null as GetCollectionIdType | null,
  CUSTOM_INSTANCE_ANALYTICS_COLLECTION_ENTITY_ID: "" as BaseEntityId | "",
  INSTANCE_ANALYTICS_ADMIN_READONLY_MESSAGE:
    Messages.UNABLE_TO_CHANGE_ADMIN_PERMISSIONS,
  getAuthorityLevelMenuItems: (
    _collection: Collection,
    _onUpdate: (collection: Collection, values: Partial<Collection>) => void,
  ): React.ReactNode[] => [],
  getIcon: (
    item: Parameters<typeof getIconBase>[0],
    _opts?: { isTenantUser?: boolean },
  ) => getIconBase(item),
  filterOutItemsFromInstanceAnalytics: <Item extends ItemWithCollection>(
    items: Item[],
  ) => items as Item[],
  canCleanUp: (_collection: Collection) => false as boolean,
  useGetCleanUpMenuItems: (
    _collection: Collection,
  ): { menuItems: JSX.Element[] } => ({
    menuItems: [],
  }),
  cleanUpRoute: null as React.ReactElement | null,
  cleanUpAlert: (() => null) as (props: {
    collection: Collection;
  }) => JSX.Element | null,
});

export const PLUGIN_COLLECTIONS = getDefaultPluginCollections();

const getDefaultPluginCollectionComponents = () => ({
  CollectionAuthorityLevelIcon:
    PluginPlaceholder as CollectionAuthorityLevelIcon,
  FormCollectionAuthorityLevelPicker:
    PluginPlaceholder as FormCollectionAuthorityLevelPicker,
  CollectionInstanceAnalyticsIcon:
    PluginPlaceholder as CollectionInstanceAnalyticsIcon,
  CollectionAuthorityLevelDisplay:
    PluginPlaceholder as ComponentType<CollectionAuthorityLevelDisplayProps>,
});

export const PLUGIN_COLLECTION_COMPONENTS =
  getDefaultPluginCollectionComponents();

/**
 * @internal Do not call directly. Use the main reinitialize function from metabase/plugins instead.
 */
export function reinitialize() {
  Object.assign(PLUGIN_COLLECTIONS, getDefaultPluginCollections());
  Object.assign(
    PLUGIN_COLLECTION_COMPONENTS,
    getDefaultPluginCollectionComponents(),
  );
}
