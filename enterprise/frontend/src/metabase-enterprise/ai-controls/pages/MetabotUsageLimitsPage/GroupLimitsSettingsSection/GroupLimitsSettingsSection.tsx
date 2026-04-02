import { useState } from "react";
import { t } from "ttag";

import { SettingsSection } from "metabase/admin/components/SettingsSection";
import { useListPermissionsGroupsQuery } from "metabase/api";
import { useSetting } from "metabase/common/hooks";
import { PLUGIN_TENANTS } from "metabase/plugins";
import { Tabs } from "metabase/ui";
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

  const {
    data: tenants,
    isLoading: isLoadingTenants,
    error: tenantsError,
  } = PLUGIN_TENANTS.useListActiveTenants();

  // Usage limits data
  const { data: groupLimits } = useGetAIControlsGroupLimitsQuery();
  const { data: instanceLimitData } = useGetAIControlsInstanceLimitQuery();
  const { data: tenantLimits } = useGetAIControlsTenantLimitsQuery(undefined, {
    skip: !isUsingTenants,
  });

  const instanceLimit = instanceLimitData?.max_usage ?? null;

  if (!isUsingTenants) {
    return (
      <SettingsSection title={t`Group limits`}>
        <GroupLimitsTab
          data-testid="user-group-limits-tab"
          error={userGroupsError}
          groupLimits={groupLimits ?? []}
          groups={userGroups}
          instanceLimit={instanceLimit}
          isLoading={isLoadingUserGroups}
          limitPeriod={limitPeriod}
          limitType={limitType}
          variant="regular-groups"
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
            error={userGroupsError}
            groupLimits={groupLimits ?? []}
            groups={userGroups}
            instanceLimit={instanceLimit}
            isLoading={isLoadingUserGroups}
            limitPeriod={limitPeriod}
            limitType={limitType}
            variant="regular-groups"
          />
        </Tabs.Panel>

        <Tabs.Panel value="tenant-groups">
          <GroupLimitsTab
            error={tenantGroupsError}
            groupLimits={groupLimits ?? []}
            groups={tenantGroups}
            instanceLimit={instanceLimit}
            isLoading={isLoadingTenantGroups}
            limitPeriod={limitPeriod}
            limitType={limitType}
            variant="tenant-groups"
          />
        </Tabs.Panel>

        <Tabs.Panel value="specific-tenants">
          <TenantLimitsTab
            error={tenantsError}
            instanceLimit={instanceLimit}
            isLoading={isLoadingTenants}
            limitPeriod={limitPeriod}
            limitType={limitType}
            tenantLimits={tenantLimits ?? []}
            tenants={tenants}
          />
        </Tabs.Panel>
      </Tabs>
    </SettingsSection>
  );
}
