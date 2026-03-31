import { useDebouncedCallback } from "@mantine/hooks";
import { useState } from "react";
import { t } from "ttag";

import { SettingsSection } from "metabase/admin/components/SettingsSection";
import {
  useGetMetabotGroupLimitsQuery,
  useGetMetabotInstanceLimitQuery,
  useGetMetabotTenantLimitsQuery,
  useListPermissionsGroupsQuery,
  useUpdateMetabotGroupLimitMutation,
  useUpdateMetabotTenantLimitMutation,
} from "metabase/api";
import { useSetting } from "metabase/common/hooks";
import { PLUGIN_TENANTS } from "metabase/plugins";
import { Tabs } from "metabase/ui";
import type { MetabotLimitPeriod } from "metabase-types/api";

import { SpecificTenantsTab } from "./SpecificTenantsTab";
import { TenantGroupsTab } from "./TenantGroupsTab";
import { UserGroupsTab } from "./UserGroupsTab";

type GroupLimitsTab = "user-groups" | "tenant-groups" | "specific-tenants";

const SAVE_DEBOUNCE_MS = 500;

export function GroupLimitsSettingsSection() {
  const isUsingTenants = useSetting("use-tenants");
  const limitPeriod =
    (useSetting("metabot-limit-reset-rate") as MetabotLimitPeriod) ?? "monthly";
  const [activeTab, setActiveTab] = useState<GroupLimitsTab>("user-groups");

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
  const { data: groupLimits } = useGetMetabotGroupLimitsQuery();
  const { data: instanceLimitData } = useGetMetabotInstanceLimitQuery();
  const { data: tenantLimits } = useGetMetabotTenantLimitsQuery(undefined, {
    skip: !isUsingTenants,
  });

  const instanceLimit = instanceLimitData?.max_usage ?? null;

  // Mutations
  const [updateGroupLimit] = useUpdateMetabotGroupLimitMutation();
  const [updateTenantLimit] = useUpdateMetabotTenantLimitMutation();

  const debouncedSaveGroupLimit = useDebouncedCallback(
    async (groupId: number, maxUsage: number | null) => {
      await updateGroupLimit({ groupId, max_usage: maxUsage });
    },
    SAVE_DEBOUNCE_MS,
  );

  const debouncedSaveTenantLimit = useDebouncedCallback(
    async (tenantId: number, maxUsage: number | null) => {
      await updateTenantLimit({ tenantId, max_usage: maxUsage });
    },
    SAVE_DEBOUNCE_MS,
  );

  const sectionTitle = isUsingTenants
    ? t`Group and tenant limits`
    : t`Group limits`;

  if (!isUsingTenants) {
    return (
      <SettingsSection title={sectionTitle}>
        <UserGroupsTab
          groups={userGroups}
          isLoading={isLoadingUserGroups}
          error={userGroupsError}
          limitPeriod={limitPeriod}
          groupLimits={groupLimits ?? []}
          instanceLimit={instanceLimit}
          onGroupLimitChange={debouncedSaveGroupLimit}
        />
      </SettingsSection>
    );
  }

  return (
    <SettingsSection title={sectionTitle}>
      <Tabs
        value={activeTab}
        onChange={(value) => setActiveTab(value as GroupLimitsTab)}
      >
        <Tabs.List mb="md">
          <Tabs.Tab value="user-groups">{t`User groups`}</Tabs.Tab>
          <Tabs.Tab value="tenant-groups">{t`Tenant groups`}</Tabs.Tab>
          <Tabs.Tab value="specific-tenants">{t`Specific tenants`}</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="user-groups">
          <UserGroupsTab
            groups={userGroups}
            isLoading={isLoadingUserGroups}
            error={userGroupsError}
            limitPeriod={limitPeriod}
            groupLimits={groupLimits ?? []}
            instanceLimit={instanceLimit}
            onGroupLimitChange={debouncedSaveGroupLimit}
          />
        </Tabs.Panel>

        <Tabs.Panel value="tenant-groups">
          <TenantGroupsTab
            tenantGroups={tenantGroups}
            isLoading={isLoadingTenantGroups}
            error={tenantGroupsError}
            limitPeriod={limitPeriod}
            groupLimits={groupLimits ?? []}
            instanceLimit={instanceLimit}
            onGroupLimitChange={debouncedSaveGroupLimit}
          />
        </Tabs.Panel>

        <Tabs.Panel value="specific-tenants">
          <SpecificTenantsTab
            tenants={tenants}
            isLoading={isLoadingTenants}
            error={tenantsError}
            tenantLimits={tenantLimits ?? []}
            onTenantLimitChange={debouncedSaveTenantLimit}
          />
        </Tabs.Panel>
      </Tabs>
    </SettingsSection>
  );
}
