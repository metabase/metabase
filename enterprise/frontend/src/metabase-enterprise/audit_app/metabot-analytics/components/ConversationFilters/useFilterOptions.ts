import { useMemo } from "react";
import { t } from "ttag";

import { useListPermissionsGroupsQuery, useListUsersQuery } from "metabase/api";
import type { DateFilterValue } from "metabase/querying/common/types";
import { deserializeDateParameterValue } from "metabase/querying/parameters/utils/parsing";
import { getUserName } from "metabase/utils/user";
import { useListTenantsQuery } from "metabase-enterprise/api";
import { hasPremiumFeature } from "metabase-enterprise/settings";
import type { GroupListQuery } from "metabase-types/api";

import type { FilterUrlState } from "./url-state";

export const DEFAULT_DATE = "past30days";
export const DEFAULT_GROUP = "1"; // All Users group
export const ALL_USERS_SYNTHETIC = "all";

export const DEFAULT_DATE_FILTER: DateFilterValue = {
  type: "relative",
  value: -30,
  unit: "day",
  options: { includeCurrent: true },
};

export function parseId(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function parseDateFilter(date: string | null): DateFilterValue {
  return (
    (date ? deserializeDateParameterValue(date) : null) ?? DEFAULT_DATE_FILTER
  );
}

function sortGroupsTenantsEnabled(
  groups: readonly GroupListQuery[],
): GroupListQuery[] {
  const internal = groups.filter(
    (g) => g.magic_group_type === "all-internal-users",
  );
  const external = groups.filter(
    (g) => g.magic_group_type === "all-external-users",
  );
  const rest = groups.filter(
    (g) =>
      g.magic_group_type !== "all-internal-users" &&
      g.magic_group_type !== "all-external-users",
  );
  return [...internal, ...external, ...rest];
}

function sortGroupsTenantsDisabled(
  groups: readonly GroupListQuery[],
): GroupListQuery[] {
  const defaultGroup = groups.filter((g) => String(g.id) === DEFAULT_GROUP);
  const rest = groups.filter((g) => String(g.id) !== DEFAULT_GROUP);
  return [...defaultGroup, ...rest];
}

export function useFilterOptions({
  date,
  user,
  group,
  tenant,
}: FilterUrlState) {
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
        label: getUserName(u) || t`Unknown`,
      })),
    [usersData],
  );

  const groupOptions = useMemo(() => {
    const rawGroups = groupsData ?? [];
    const ordered = tenantsFeatureEnabled
      ? sortGroupsTenantsEnabled(rawGroups)
      : sortGroupsTenantsDisabled(rawGroups);
    const options = ordered.map((g) => ({
      value: String(g.id),
      label: g.name,
    }));
    return tenantsFeatureEnabled
      ? [{ value: ALL_USERS_SYNTHETIC, label: t`All users` }, ...options]
      : options;
  }, [groupsData, tenantsFeatureEnabled]);

  const tenantOptions = useMemo(
    () =>
      (tenantsData?.data ?? []).map((tenant) => ({
        value: String(tenant.id),
        label: tenant.name,
      })),
    [tenantsData],
  );

  const hasTenants = tenantsFeatureEnabled && tenantOptions.length > 0;

  const dateFilter = useMemo(() => parseDateFilter(date), [date]);
  const userId = parseId(user);
  const groupNoFilterValue = tenantsFeatureEnabled
    ? ALL_USERS_SYNTHETIC
    : DEFAULT_GROUP;
  const groupId =
    group == null || group === groupNoFilterValue ? undefined : parseId(group);
  const tenantId = hasTenants ? parseId(tenant) : undefined;

  return {
    dateFilter,
    userId,
    groupId,
    groupNoFilterValue,
    tenantId,
    userOptions,
    groupOptions,
    tenantOptions,
    hasTenants,
    isLoading: isLoadingUsers || isLoadingGroups || isLoadingTenants,
  };
}
