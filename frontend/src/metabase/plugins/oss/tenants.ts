import type React from "react";

import type { CollectionItemListProps } from "metabase/common/components/Pickers/CollectionPicker/types";
import type { CollectionTreeItem } from "metabase/entities/collections/utils";
import type {
  Collection,
  CollectionId,
  CollectionNamespace,
  Group,
  User,
} from "metabase-types/api";

import { PluginPlaceholder } from "../components/PluginPlaceholder";

export type TenantCollectionPathItem = {
  id: CollectionId;
  namespace?: CollectionNamespace;
  type?: Collection["type"];
  collection_id?: CollectionId | null;
  collection_namespace?: CollectionNamespace;
  is_shared_tenant_collection?: boolean;
  is_tenant_dashboard?: boolean;
};

const getDefaultPluginTenants = () => ({
  isEnabled: false,
  userStrategyRoute: null as React.ReactElement | null,
  tenantsRoutes: null as React.ReactElement | null,
  EditUserStrategySettingsButton: PluginPlaceholder,
  FormTenantWidget: (_props: any) => null as React.ReactElement | null,
  TenantDisplayName: (_props: any) => null as React.ReactElement | null,
  isExternalUsersGroup: (_group: Pick<Group, "magic_group_type">) => false,
  isTenantGroup: (_group: Pick<Group, "is_tenant_group">) => false,
  isExternalUser: (_user?: Pick<User, "tenant_id">) => false,
  isTenantCollection: (_collection: Partial<Pick<Collection, "namespace">>) =>
    false,
  PeopleNav: null as React.ReactElement | null,
  ReactivateExternalUserButton: ({ user: _user }: { user: User }) =>
    null as React.ReactElement | null,
  TenantGroupHintIcon: PluginPlaceholder,
  MainNavSharedCollections: PluginPlaceholder as React.ComponentType<{
    canCreateSharedCollection: boolean;
    sharedTenantCollections: Collection[] | undefined;
  }>,
  TenantCollectionItemList: (_props: CollectionItemListProps) =>
    null as React.ReactElement | null,
  TenantSpecificCollectionsItemList: (_props: CollectionItemListProps) =>
    null as React.ReactElement | null,
  TenantCollectionList: PluginPlaceholder,
  TenantUsersList: PluginPlaceholder,
  TenantUsersPersonalCollectionList: PluginPlaceholder as React.ComponentType<{
    params: { tenantId: string };
  }>,
  GroupDescription: (_props: { group: Group }) =>
    null as React.ReactElement | null,
  EditUserStrategyModal: PluginPlaceholder,
  getNewUserModalTitle: (_isExternal: boolean) => null as string | null,
  getFormGroupsTitle: (_isExternal: boolean) => null as string | null,
  SHARED_TENANT_NAMESPACE: null as CollectionNamespace,
  isTenantNamespace: (_namespace?: CollectionNamespace) => false,
  isTenantCollectionId: (_id: CollectionId) => false,
  getNamespaceForTenantId: (_id: CollectionId) => null as CollectionNamespace,
  getTenantCollectionPathPrefix: (_collection: TenantCollectionPathItem) =>
    null as CollectionId[] | null,
  getTenantRootDisabledReason: () => null as string | null,
  getNamespaceDisplayName: (_namespace?: CollectionNamespace) =>
    null as string | null,
  TENANT_SPECIFIC_COLLECTIONS: null as {
    id: "tenant-specific";
    name: string;
    location: string;
    path: CollectionId[];
    can_write: boolean;
  } | null,
  getFlattenedCollectionsForNavbar: () => [],
  useTenantMainNavbarData: () => ({
    canCreateSharedCollection: false,
    showExternalCollectionsSection: false,
    sharedTenantCollections: [],
  }),
});

export const PLUGIN_TENANTS: {
  isEnabled: boolean;
  userStrategyRoute: React.ReactElement | null;
  useTenantMainNavbarData: () => {
    canCreateSharedCollection: boolean;
    showExternalCollectionsSection: boolean;
    sharedTenantCollections: Collection[] | undefined;
  };
  tenantsRoutes: React.ReactElement | null;
  EditUserStrategySettingsButton: (props: {
    page: "people" | "tenants";
  }) => React.ReactElement | null;
  FormTenantWidget: (props: any) => React.ReactElement | null;
  TenantDisplayName: (props: any) => React.ReactElement | null;
  isExternalUsersGroup: (group: Pick<Group, "magic_group_type">) => boolean;
  isTenantGroup: (group: Pick<Group, "is_tenant_group">) => boolean;
  isExternalUser: (user?: Pick<User, "tenant_id">) => boolean;
  isTenantCollection: (
    collection: Partial<Pick<Collection, "namespace">>,
  ) => boolean;
  PeopleNav: React.ReactElement | null;
  ReactivateExternalUserButton: (props: {
    user: User;
  }) => React.ReactElement | null;
  TenantGroupHintIcon: React.ComponentType;
  MainNavSharedCollections: React.ComponentType<{
    canCreateSharedCollection: boolean;
    sharedTenantCollections: Collection[] | undefined;
  }>;
  TenantCollectionItemList: (
    props: CollectionItemListProps,
  ) => React.ReactElement | null;
  TenantSpecificCollectionsItemList: (
    props: CollectionItemListProps,
  ) => React.ReactElement | null;
  TenantCollectionList: React.ComponentType;
  TenantUsersList: React.ComponentType;
  TenantUsersPersonalCollectionList: React.ComponentType<{
    params: { tenantId: string };
  }>;
  GroupDescription: (props: { group: Group }) => React.ReactElement | null;
  EditUserStrategyModal: (props: {
    onClose: () => void;
  }) => React.ReactElement | null;
  getNewUserModalTitle: (isExternal: boolean) => string | null;
  getFormGroupsTitle: (isExternal: boolean) => string | null;
  SHARED_TENANT_NAMESPACE: CollectionNamespace;
  isTenantNamespace: (namespace?: CollectionNamespace) => boolean;
  isTenantCollectionId: (id: CollectionId) => boolean;
  getNamespaceForTenantId: (id: CollectionId) => CollectionNamespace;
  getTenantCollectionPathPrefix: (
    collection: TenantCollectionPathItem,
  ) => CollectionId[] | null;
  getTenantRootDisabledReason: () => string | null;
  getNamespaceDisplayName: (namespace?: CollectionNamespace) => string | null;
  TENANT_SPECIFIC_COLLECTIONS: {
    id: "tenant-specific";
    name: string;
    location: string;
    path: CollectionId[];
    can_write: boolean;
  } | null;
  getFlattenedCollectionsForNavbar: (args: {
    currentUser: User | null;
    sharedTenantCollections: Collection[] | undefined;
    regularCollections: CollectionTreeItem[];
  }) => CollectionTreeItem[];
} = getDefaultPluginTenants();

/**
 * @internal Do not call directly. Use the main reinitialize function from metabase/plugins instead.
 */
export function reinitialize() {
  Object.assign(PLUGIN_TENANTS, getDefaultPluginTenants());
}
