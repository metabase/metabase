import type React from "react";

import { PluginPlaceholder } from "../components/PluginPlaceholder";
import type { CollectionItemListProps } from "../types";
import type { Collection, Group, User } from "metabase-types/api";

const getDefaultPluginTenants = () => ({
  userStrategyRoute: null as React.ReactElement | null,
  tenantsRoutes: null as React.ReactElement | null,
  EditUserStrategySettingsButton: PluginPlaceholder,
  FormTenantWidget: (_props: any) => null as React.ReactElement | null,
  TenantDisplayName: (_props: any) => null as React.ReactElement | null,
  isExternalUsersGroup: (_group: Pick<Group, "magic_group_type">) => false,
  isTenantGroup: (_group: Pick<Group, "is_tenant_group">) => false,
  isExternalUser: (_user?: Pick<User, "tenant_id">) => false,
  isTenantCollection: (_collection: Collection) => false,
  PeopleNav: null as React.ReactElement | null,
  ReactivateExternalUserButton: ({ user: _user }: { user: User }) =>
    null as React.ReactElement | null,
  TenantGroupHintIcon: PluginPlaceholder,
  MainNavSharedCollections: PluginPlaceholder,
  TenantCollectionItemList: (_props: CollectionItemListProps) =>
    null as React.ReactElement | null,
  TenantCollectionList: PluginPlaceholder,
});

export const PLUGIN_TENANTS: {
  userStrategyRoute: React.ReactElement | null;
  tenantsRoutes: React.ReactElement | null;
  EditUserStrategySettingsButton: React.ComponentType;
  FormTenantWidget: (props: any) => React.ReactElement | null;
  TenantDisplayName: (props: any) => React.ReactElement | null;
  isExternalUsersGroup: (group: Pick<Group, "magic_group_type">) => boolean;
  isTenantGroup: (group: Pick<Group, "is_tenant_group">) => boolean;
  isExternalUser: (user?: Pick<User, "tenant_id">) => boolean;
  isTenantCollection: (collection: Collection) => boolean;
  PeopleNav: React.ReactElement | null;
  ReactivateExternalUserButton: (props: { user: User }) => React.ReactElement | null;
  TenantGroupHintIcon: React.ComponentType;
  MainNavSharedCollections: React.ComponentType;
  TenantCollectionItemList: (props: CollectionItemListProps) => React.ReactElement | null;
} = getDefaultPluginTenants();

/**
 * @internal Do not call directly. Use the main reinitialize function from metabase/plugins instead.
 */
export function reinitialize() {
  Object.assign(PLUGIN_TENANTS, getDefaultPluginTenants());
}
