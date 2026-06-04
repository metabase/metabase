import type React from "react";
import type { ComponentType } from "react";
import { t } from "ttag";

import { Messages } from "metabase/admin/permissions/constants/messages";
import type {
  CollectionAuthorityLevelConfig,
  CollectionInstanceAnaltyicsConfig,
} from "metabase/collections/types";
import { useGetIconBase } from "metabase/hooks/use-icon";
import { PluginPlaceholder } from "metabase/plugins/components/PluginPlaceholder";
import type { IconProps } from "metabase/ui";
import type {
  BaseEntityId,
  Bookmark,
  Collection,
  CollectionEssentials,
  CollectionId,
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

type PluginCollections = {
  AUTHORITY_LEVEL: Record<string, CollectionAuthorityLevelConfig>;
  COLLECTION_TYPES: Record<string, CollectionAuthorityLevelConfig>;
  REGULAR_COLLECTION: CollectionAuthorityLevelConfig;
  isRegularCollection: (data: Partial<Collection> | Bookmark) => boolean;
  isSyncedCollection: (data: Partial<Collection>) => boolean;
  getCollectionType: (
    collection: Partial<Collection>,
  ) => CollectionAuthorityLevelConfig | CollectionInstanceAnaltyicsConfig;
  useGetDefaultCollectionId: GetCollectionIdType | null;
  CUSTOM_INSTANCE_ANALYTICS_COLLECTION_ENTITY_ID: BaseEntityId | "";
  INSTANCE_ANALYTICS_ADMIN_READONLY_MESSAGE: string;
  getAuthorityLevelMenuItems: (
    collection: Collection,
    onUpdate: (collection: Collection, values: Partial<Collection>) => void,
  ) => React.ReactNode[];
  useGetIcon: typeof useGetIconBase;
  filterOutItemsFromInstanceAnalytics: <Item extends ItemWithCollection>(
    items: Item[],
  ) => Item[];
  canCleanUp: (collection: Collection) => boolean;
  useGetCleanUpMenuItems: (collection: Collection) => {
    menuItems: JSX.Element[];
  };
  cleanUpRoute: React.ReactElement | null;
  cleanUpAlert: (props: { collection: Collection }) => JSX.Element | null;
};

type PluginCollectionComponents = {
  CollectionAuthorityLevelIcon: CollectionAuthorityLevelIcon;
  FormCollectionAuthorityLevelPicker: FormCollectionAuthorityLevelPicker;
  CollectionInstanceAnalyticsIcon: CollectionInstanceAnalyticsIcon;
  CollectionAuthorityLevelDisplay: ComponentType<CollectionAuthorityLevelDisplayProps>;
};

const AUTHORITY_LEVEL_REGULAR: CollectionAuthorityLevelConfig = {
  type: null,
  get name() {
    return t`Regular`;
  },
  icon: "folder",
};

const getDefaultPluginCollections = (): PluginCollections => ({
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
  useGetDefaultCollectionId: null,
  CUSTOM_INSTANCE_ANALYTICS_COLLECTION_ENTITY_ID: "",
  INSTANCE_ANALYTICS_ADMIN_READONLY_MESSAGE:
    Messages.UNABLE_TO_CHANGE_ADMIN_PERMISSIONS,
  getAuthorityLevelMenuItems: (
    _collection: Collection,
    _onUpdate: (collection: Collection, values: Partial<Collection>) => void,
  ): React.ReactNode[] => [],
  useGetIcon: useGetIconBase,
  filterOutItemsFromInstanceAnalytics: <Item extends ItemWithCollection>(
    items: Item[],
  ) => items,
  canCleanUp: (_collection: Collection) => false,
  useGetCleanUpMenuItems: (
    _collection: Collection,
  ): { menuItems: JSX.Element[] } => ({
    menuItems: [],
  }),
  cleanUpRoute: null,
  cleanUpAlert: (_props) => null,
});

export const PLUGIN_COLLECTIONS = getDefaultPluginCollections();

const getDefaultPluginCollectionComponents =
  (): PluginCollectionComponents => ({
    CollectionAuthorityLevelIcon: PluginPlaceholder<
      React.ComponentProps<CollectionAuthorityLevelIcon>
    >,
    FormCollectionAuthorityLevelPicker: PluginPlaceholder<
      React.ComponentProps<FormCollectionAuthorityLevelPicker>
    >,
    CollectionInstanceAnalyticsIcon: PluginPlaceholder<
      React.ComponentProps<CollectionInstanceAnalyticsIcon>
    >,
    CollectionAuthorityLevelDisplay:
      PluginPlaceholder<CollectionAuthorityLevelDisplayProps>,
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
