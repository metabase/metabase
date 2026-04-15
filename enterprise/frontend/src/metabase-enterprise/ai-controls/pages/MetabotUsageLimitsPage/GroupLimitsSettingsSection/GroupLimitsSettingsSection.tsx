import { useMemo, useState } from "react";
import { t } from "ttag";

import { SettingsSection } from "metabase/admin/components/SettingsSection";
import { useListPermissionsGroupsQuery } from "metabase/api";
import { useSetting } from "metabase/common/hooks";
import { PLUGIN_TENANTS } from "metabase/plugins";
import { Tabs } from "metabase/ui";
import { isDefaultGroup } from "metabase/utils/groups";
import {
  useGetAIControlsGroupLimitsQuery,
  useGetAIControlsInstanceLimitQuery,
  useGetAIControlsTenantLimitsQuery,
} from "metabase-enterprise/api";
import type { MetabotLimitPeriod, MetabotLimitType } from "metabase-types/api";

import { GroupLimitsTab } from "./GroupLimitsTab";
import { TenantLimitsTab } from "./TenantLimitsTab";

type GroupLimitsTabValue = "user-groups" | "tenant-groups" | "specific-tenants";

export function GroupLimitsSettingsSection() {
  const isUsingTenants = useSetting("use-tenants");
  const limitPeriod =
    (useSetting("metabot-limit-reset-rate") as MetabotLimitPeriod) ?? "monthly";
  const limitType =
    (useSetting("metabot-limit-unit") as MetabotLimitType) ?? "tokens";
  const [activeTab, setActiveTab] =
    useState<GroupLimitsTabValue>("user-groups");

  // Groups data
  const {
    data: userGroups = [],
    isLoading: isLoadingUserGroups,
    error: userGroupsError,
  } = useListPermissionsGroupsQuery(
    isUsingTenants ? { tenancy: "internal" } : undefined,
  );

  const {
    data: tenantGroups = [],
    isLoading: isLoadingTenantGroups,
    error: tenantGroupsError,
  } = useListPermissionsGroupsQuery(
    isUsingTenants ? { tenancy: "external" } : undefined,
    { skip: !isUsingTenants },
  );

  const {
    data: tenants = [],
    isLoading: isLoadingTenants,
    error: tenantsError,
  } = PLUGIN_TENANTS.useListActiveTenants();

  // Usage limits data
  const {
    data: groupLimits = [],
    isLoading: isLoadingGroupLimits,
    error: groupLimitsError,
  } = useGetAIControlsGroupLimitsQuery();
  const { data: instanceLimitData } = useGetAIControlsInstanceLimitQuery();
  const {
    data: tenantLimits = [],
    isLoading: isLoadingTenantLimits,
    error: tenantLimitsError,
  } = useGetAIControlsTenantLimitsQuery(undefined, {
    skip: !isUsingTenants,
  });

  const instanceLimit = instanceLimitData?.max_usage ?? null;

  const allUsersGroup = useMemo(
    () => userGroups.find((g) => isDefaultGroup(g)),
    [userGroups],
  );
  const allUsersGroupLimit = useMemo(() => {
    if (!allUsersGroup) {
      return undefined;
    }
    const limitEntry = groupLimits.find((l) => l.group_id === allUsersGroup.id);
    // No entry means unlimited (null)
    return limitEntry?.max_usage ?? null;
  }, [allUsersGroup, groupLimits]);

  const allTenantUsersGroup = useMemo(
    () => tenantGroups.find((g) => g.magic_group_type === "all-external-users"),
    [tenantGroups],
  );
  const allTenantUsersGroupLimit = useMemo(() => {
    if (!allTenantUsersGroup) {
      return undefined;
    }
    const limitEntry = groupLimits.find(
      (l) => l.group_id === allTenantUsersGroup.id,
    );
    return limitEntry?.max_usage ?? null;
  }, [allTenantUsersGroup, groupLimits]);

  const commonLimitPeriodProps = {
    instanceLimit,
    limitPeriod,
    limitType,
  };

  if (!isUsingTenants) {
    return (
      <SettingsSection title={t`Group limits`}>
        <GroupLimitsTab
          data-testid="user-group-limits-tab"
          {...commonLimitPeriodProps}
          hasGroupsError={!!(userGroupsError || groupLimitsError)}
          groupLimits={groupLimits}
          groups={userGroups}
          isLoading={isLoadingUserGroups || isLoadingGroupLimits}
          variant="regular-groups"
          allUsersGroup={allUsersGroup}
          allUsersGroupLimit={allUsersGroupLimit}
        />
      </SettingsSection>
    );
  }

  return (
    <SettingsSection title={t`Group and tenant limits`}>
      <Tabs
        value={activeTab}
        onChange={(value) => setActiveTab(value as GroupLimitsTabValue)}
      >
        <Tabs.List mb="md">
          <Tabs.Tab value="user-groups">{t`User groups`}</Tabs.Tab>
          <Tabs.Tab value="tenant-groups">{t`Tenant groups`}</Tabs.Tab>
          <Tabs.Tab value="specific-tenants">{t`Specific tenants`}</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="user-groups">
          <GroupLimitsTab
            {...commonLimitPeriodProps}
            hasGroupsError={!!(userGroupsError || groupLimitsError)}
            groupLimits={groupLimits}
            groups={userGroups}
            isLoading={isLoadingUserGroups || isLoadingGroupLimits}
            variant="regular-groups"
            allUsersGroup={allUsersGroup}
            allUsersGroupLimit={allUsersGroupLimit}
          />
        </Tabs.Panel>

        <Tabs.Panel value="tenant-groups">
          <GroupLimitsTab
            {...commonLimitPeriodProps}
            hasGroupsError={!!(tenantGroupsError || groupLimitsError)}
            groupLimits={groupLimits}
            groups={tenantGroups}
            isLoading={isLoadingTenantGroups || isLoadingGroupLimits}
            variant="tenant-groups"
            allUsersGroup={allTenantUsersGroup}
            allUsersGroupLimit={allTenantUsersGroupLimit}
          />
        </Tabs.Panel>

        <Tabs.Panel value="specific-tenants">
          <TenantLimitsTab
            {...commonLimitPeriodProps}
            hasTenantsError={!!(tenantsError || tenantLimitsError)}
            isLoading={isLoadingTenants || isLoadingTenantLimits}
            tenantLimits={tenantLimits}
            tenants={tenants}
          />
        </Tabs.Panel>
      </Tabs>
    </SettingsSection>
  );
}
