import { useMemo } from "react";

import { useListPermissionsGroupsQuery, useListUsersQuery } from "metabase/api";
import { getUserName } from "metabase/utils/user";
import { useListTenantsQuery } from "metabase-enterprise/api";
import { hasPremiumFeature } from "metabase-enterprise/settings";

export const DEFAULT_DATE = "past30days";
export const DEFAULT_GROUP = "1"; // All Users group

export function useFilterOptions() {
  const tenantsFeatureEnabled = !!hasPremiumFeature("tenants");
  const { data: usersData, isLoading: isLoadingUsers } = useListUsersQuery({});
  const { data: groupsData, isLoading: isLoadingGroups } =
    useListPermissionsGroupsQuery(undefined);
  const { data: tenantsData, isLoading: isLoadingTenants } =
    useListTenantsQuery({ status: "active" }, { skip: !tenantsFeatureEnabled });

  const userOptions = useMemo(
    () =>
      (usersData?.data ?? []).map((u) => ({
        value: String(u.id),
        label: getUserName(u) || String(u.id),
      })),
    [usersData],
  );

  const groupOptions = useMemo(() => {
    const groups = (groupsData ?? []).map((g) => ({
      value: String(g.id),
      label: g.name,
    }));
    const defaultGroup = groups.find((g) => g.value === DEFAULT_GROUP);
    const rest = groups.filter((g) => g.value !== DEFAULT_GROUP);
    return defaultGroup ? [defaultGroup, ...rest] : groups;
  }, [groupsData]);

  const tenantOptions = useMemo(
    () =>
      (tenantsData?.data ?? []).map((t) => ({
        value: String(t.id),
        label: t.name,
      })),
    [tenantsData],
  );

  // hide the filter on instances that have the feature but no tenants
  // to choose from — an "All tenants"-only Select is a dead UI
  const hasTenants = tenantsFeatureEnabled && tenantOptions.length > 0;

  return {
    userOptions,
    groupOptions,
    tenantOptions,
    hasTenants,
    isLoading: isLoadingUsers || isLoadingGroups || isLoadingTenants,
  };
}
