import { useState } from "react";
import { t } from "ttag";

import { useListPermissionsGroupsQuery } from "metabase/api";
import { AdminSettingsLayout } from "metabase/common/components/AdminLayout/AdminSettingsLayout";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useSetting } from "metabase/common/hooks";
import { Title } from "metabase/ui";

import { MetabotNavPane } from "../MetabotNavPane";

import { AiFeatureAccessTable } from "./AiFeatureAccessTable";
import { GroupCategoryTabs } from "./GroupCategoryTabs";
import { useMetabotGroupPermissions } from "./utils";

type TabValue = "user-groups" | "tenant-groups";

export function MetabotFeatureAccessPage() {
  const isUsingTenants = useSetting("use-tenants");
  const [activeTab, setActiveTab] = useState<TabValue>("user-groups");

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

  const { groupPermissions, onPermissionChange } = useMetabotGroupPermissions();

  const activeGroups =
    activeTab === "tenant-groups" ? tenantGroups : userGroups;
  const isLoading =
    activeTab === "tenant-groups" ? isLoadingTenantGroups : isLoadingUserGroups;
  const error =
    activeTab === "tenant-groups" ? tenantGroupsError : userGroupsError;

  return (
    <AdminSettingsLayout sidebar={<MetabotNavPane />} maw="50rem">
      <Title order={1} mb="md" mt="sm">
        {t`AI feature access`}
      </Title>

      {isUsingTenants && (
        <GroupCategoryTabs setActiveTab={setActiveTab} activeTab={activeTab} />
      )}

      <LoadingAndErrorWrapper
        loading={isLoading}
        error={error ? t`Error loading groups` : null}
      >
        {activeGroups && (
          <AiFeatureAccessTable
            groups={activeGroups}
            groupPermissions={groupPermissions}
            onPermissionChange={onPermissionChange}
          />
        )}
      </LoadingAndErrorWrapper>
    </AdminSettingsLayout>
  );
}
