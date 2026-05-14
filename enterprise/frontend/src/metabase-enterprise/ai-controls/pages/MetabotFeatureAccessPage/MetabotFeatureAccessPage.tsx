import { useState } from "react";
import { t } from "ttag";

import { SettingsPageWrapper } from "metabase/admin/components/SettingsSection";
import { useListPermissionsGroupsQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useSetting } from "metabase/common/hooks";
import { Group, Stack, Title } from "metabase/ui";

import { AiFeatureAccessTable } from "./components/AiFeatureAccessTable";
import { GearIconMenu } from "./components/GearIconMenu/GearIconMenu";
import { GroupCategoryTabs } from "./components/GroupCategoryTabs";
import { type GroupTab, useMetabotGroupPermissions } from "./utils";

export function MetabotFeatureAccessPage() {
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

  const {
    groupPermissions,
    onPermissionChange,
    advanced,
    error: permissionsError,
  } = useMetabotGroupPermissions();

  const activeGroups =
    activeTab === "tenant-groups" ? tenantGroups : userGroups;
  const isLoading =
    activeTab === "tenant-groups" ? isLoadingTenantGroups : isLoadingUserGroups;
  const groupsError =
    activeTab === "tenant-groups" ? tenantGroupsError : userGroupsError;
  const error = groupsError || permissionsError;

  return (
    <SettingsPageWrapper mt="sm" gap="md">
      <Group justify="space-between" w="100%">
        <Title order={1}>{t`AI feature access`}</Title>
        {advanced && <GearIconMenu />}
      </Group>

      {isUsingTenants && (
        <GroupCategoryTabs setActiveTab={setActiveTab} activeTab={activeTab} />
      )}

      <Stack gap="md">
        <LoadingAndErrorWrapper loading={isLoading} error={error}>
          {activeGroups && (
            <AiFeatureAccessTable
              groups={activeGroups}
              groupPermissions={groupPermissions}
              onPermissionChange={onPermissionChange}
              advanced={advanced}
              activeTab={activeTab}
            />
          )}
        </LoadingAndErrorWrapper>
      </Stack>
    </SettingsPageWrapper>
  );
}
