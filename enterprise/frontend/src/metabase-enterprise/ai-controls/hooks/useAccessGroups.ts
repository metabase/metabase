import { useState } from "react";

import { useListPermissionsGroupsQuery } from "metabase/api";
import { useSetting } from "metabase/settings";
import type { GroupInfo } from "metabase-types/api";

import type { GroupTab } from "../types";

type AccessGroups = {
  isUsingTenants: boolean;
  activeTab: GroupTab;
  setActiveTab: (tab: GroupTab) => void;
  groups: GroupInfo[] | undefined;
  isLoading: boolean;
  error: unknown;
};

export function useAccessGroups(): AccessGroups {
  const isUsingTenants = useSetting("use-tenants");
  const [activeTab, setActiveTab] = useState<GroupTab>("user-groups");

  const {
    data: userGroups,
    isLoading: isLoadingUserGroups,
    error: userGroupsError,
  } = useListPermissionsGroupsQuery(
    isUsingTenants ? { tenancy: "internal" } : undefined,
  );

  const {
    data: tenantGroups,
    isLoading: isLoadingTenantGroups,
    error: tenantGroupsError,
  } = useListPermissionsGroupsQuery(
    isUsingTenants ? { tenancy: "external" } : undefined,
    { skip: !isUsingTenants },
  );

  const isTenantTab = activeTab === "tenant-groups";

  return {
    isUsingTenants,
    activeTab,
    setActiveTab,
    groups: isTenantTab ? tenantGroups : userGroups,
    isLoading: isTenantTab ? isLoadingTenantGroups : isLoadingUserGroups,
    error: isTenantTab ? tenantGroupsError : userGroupsError,
  };
}
