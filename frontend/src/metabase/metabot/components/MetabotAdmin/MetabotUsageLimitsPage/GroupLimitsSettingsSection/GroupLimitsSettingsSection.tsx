import { useState } from "react";
import { t } from "ttag";

import { SettingsSection } from "metabase/admin/components/SettingsSection";
import { useListPermissionsGroupsQuery } from "metabase/api";
import { useSetting } from "metabase/common/hooks";
import { PLUGIN_TENANTS } from "metabase/plugins";
import { Tabs } from "metabase/ui";
import type { MetabotLimitPeriod } from "metabase-types/api";

import { SpecificTenantsTab } from "./SpecificTenantsTab";
import { TenantGroupsTab } from "./TenantGroupsTab";
import { UserGroupsTab } from "./UserGroupsTab";

type GroupLimitsTab = "user-groups" | "tenant-groups" | "specific-tenants";

// TODO: This should come from the GeneralLimitsSettingsSection state once
// that state is lifted to the page level. For now we default to "monthly".
const DEFAULT_LIMIT_PERIOD: MetabotLimitPeriod = "monthly";

export function GroupLimitsSettingsSection() {
  const isUsingTenants = useSetting("use-tenants");
  const [activeTab, setActiveTab] = useState<GroupLimitsTab>("user-groups");

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
          limitPeriod={DEFAULT_LIMIT_PERIOD}
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
            limitPeriod={DEFAULT_LIMIT_PERIOD}
          />
        </Tabs.Panel>

        <Tabs.Panel value="tenant-groups">
          <TenantGroupsTab
            tenantGroups={tenantGroups}
            isLoading={isLoadingTenantGroups}
            error={tenantGroupsError}
          />
        </Tabs.Panel>

        <Tabs.Panel value="specific-tenants">
          <SpecificTenantsTab
            tenants={tenants}
            isLoading={isLoadingTenants}
            error={tenantsError}
          />
        </Tabs.Panel>
      </Tabs>
    </SettingsSection>
  );
}
