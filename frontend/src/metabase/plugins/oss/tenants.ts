import type React from "react";
import type { SetStateAction } from "react";

import type { CollectionTreeItem } from "metabase/collections/utils";
import type {
  OmniPickerCollectionItem,
  OmniPickerItem,
} from "metabase/common/components/Pickers";
import type {
  Collection,
  CollectionId,
  CollectionItemModel,
  CollectionNamespace,
  DataSegregationStrategy,
  Group,
  Tenant,
  User,
} from "metabase-types/api";

import { PluginPlaceholder } from "../components/PluginPlaceholder";

export type CreatedTenantData = {
  name: string;
  slug: string;
  dataIsolationFieldValue: string;
};

export type TenantCollectionPathItem = {
  id: CollectionId;
  namespace?: CollectionNamespace;
  type?: Collection["type"];
  collection_id?: CollectionId | null;
  collection_namespace?: CollectionNamespace;
  is_shared_tenant_collection?: boolean;
  is_tenant_dashboard?: boolean;
};

export type UseListActiveTenantsResult = {
  data: Tenant[] | undefined;
  isLoading: boolean;
  error: unknown;
};

const getDefaultPluginTenants = () => ({
  isEnabled: false,
  useListActiveTenants: (): UseListActiveTenantsResult => ({
    data: undefined,
    isLoading: false,
    error: undefined,
  }),
  userStrategyRoute: null,
  tenantsRoutes: null,
  CreateTenantsOnboardingStep: PluginPlaceholder<{
    onTenantsCreated?: (tenants: CreatedTenantData[]) => void;
    tenants: CreatedTenantData[];
    onTenantsChange: (value: SetStateAction<CreatedTenantData[]>) => void;
    selectedFieldIds?: number[];
    strategy?: DataSegregationStrategy | null;
    rlsColumnName?: string | null;
  }>,
  TenantsSummaryOnboardingStep: PluginPlaceholder<{
    tenants: CreatedTenantData[];
    strategy?: DataSegregationStrategy | null;
    rlsTableNames?: string[];
    rlsColumnName?: string | null;
  }>,
  EditUserStrategySettingsButton: PluginPlaceholder,
  FormTenantWidget: (_props: any) => null,
  TenantDisplayName: (_props: any) => null,
  isExternalUsersGroup: (_group: Pick<Group, "magic_group_type">) => false,
  isTenantGroup: (_group: Pick<Group, "is_tenant_group">) => false,
  isExternalUser: (_user?: Pick<User, "tenant_id">) => false,
  isTenantCollection: (_collection: Partial<Pick<Collection, "namespace">>) =>
    false,
  PeopleNav: null,
  ReactivateExternalUserButton: ({ user: _user }: { user: User }) => null,
  TenantGroupHintIcon: PluginPlaceholder,
  MainNavSharedCollections: PluginPlaceholder<{
    canAccessTenantSpecificCollections: boolean;
    canCreateSharedCollection: boolean;
    sharedTenantCollections: Collection[] | undefined;
  }>,
  TenantCollectionItemList: (_props: { pathIndex: number }) => null,
  TenantSpecificCollectionsItemList: (_props: { pathIndex: number }) => null,
  TenantCollectionList: PluginPlaceholder,
  CanAccessTenantSpecificRoute: PluginPlaceholder<{
    children: React.ReactNode;
  }>,
  TenantUsersList: PluginPlaceholder,
  TenantUsersPersonalCollectionList: PluginPlaceholder<{
    params: { tenantId: string };
  }>,
  GroupDescription: (_props: { group: Group }) => null,
  EditUserStrategyModal: PluginPlaceholder,
  getNewUserModalTitle: (_isExternal: boolean): string | null => null,
  getFormGroupsTitle: (_isExternal: boolean): string | null => null,
  // cannot be null, because that refers to the default namespace
  SHARED_TENANT_NAMESPACE: "none" as CollectionNamespace,
  // cannot be null, because that refers to the default namespace
  TENANT_SPECIFIC_NAMESPACE: "none" as CollectionNamespace,
  canPlaceEntityInCollection: () => true,
  getRootCollectionItem: (): OmniPickerCollectionItem | null => null,
  getTenantRootDisabledReason: (): string | null => null,
  getNamespaceDisplayName: (_namespace?: CollectionNamespace): string | null =>
    null,
  getFlattenedCollectionsForNavbar: () => [],
  useTenantMainNavbarData: () => ({
    canAccessTenantSpecificCollections: false,
    canCreateSharedCollection: false,
    showExternalCollectionsSection: false,
    sharedTenantCollections: [],
  }),
});

export const PLUGIN_TENANTS: {
  isEnabled: boolean;
  useListActiveTenants: () => UseListActiveTenantsResult;
  userStrategyRoute: React.ReactElement | null;
  useTenantMainNavbarData: () => {
    canAccessTenantSpecificCollections: boolean;
    canCreateSharedCollection: boolean;
    showExternalCollectionsSection: boolean;
    sharedTenantCollections: Collection[] | undefined;
  };
  tenantsRoutes: React.ReactElement | null;
  CreateTenantsOnboardingStep: React.ComponentType<{
    onTenantsCreated?: (tenants: CreatedTenantData[]) => void;
    tenants: CreatedTenantData[];
    onTenantsChange: (value: SetStateAction<CreatedTenantData[]>) => void;
    selectedFieldIds?: number[];
    strategy?: DataSegregationStrategy | null;
    rlsColumnName?: string | null;
  }>;
  TenantsSummaryOnboardingStep: React.ComponentType<{
    tenants: CreatedTenantData[];
    strategy?: DataSegregationStrategy | null;
    rlsTableNames?: string[];
    rlsColumnName?: string | null;
  }>;
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
    canAccessTenantSpecificCollections: boolean;
    canCreateSharedCollection: boolean;
    sharedTenantCollections: Collection[] | undefined;
  }>;
  TenantCollectionItemList: (props: {
    pathIndex: number;
  }) => React.ReactElement | null;
  TenantSpecificCollectionsItemList: (props: {
    pathIndex: number;
  }) => React.ReactElement | null;
  TenantCollectionList: React.ComponentType;
  CanAccessTenantSpecificRoute: React.ComponentType<{
    children: React.ReactNode;
  }>;
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
  TENANT_SPECIFIC_NAMESPACE: CollectionNamespace;
  canPlaceEntityInCollection: ({
    entityType,
    collection,
  }: {
    entityType?: CollectionItemModel;
    collection: OmniPickerItem;
  }) => boolean;
  getRootCollectionItem: (args: {
    namespace: CollectionNamespace;
  }) => OmniPickerCollectionItem | null;
  getTenantRootDisabledReason: () => string | null;
  getNamespaceDisplayName: (namespace?: CollectionNamespace) => string | null;
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
