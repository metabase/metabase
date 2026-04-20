import { useState } from "react";
import { t } from "ttag";

import { SettingsPageWrapper } from "metabase/admin/components/SettingsSection";
import { useListPermissionsGroupsQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useSetting } from "metabase/common/hooks";
import { ActionIcon, Button, Group, Icon, Menu, Title } from "metabase/ui";

import { AiFeatureAccessTable } from "./AiFeatureAccessTable";
import { DisableAdvancedModal } from "./DisableAdvancedModal";
import { EnableAdvancedModal } from "./EnableAdvancedModal";
import { GroupCategoryTabs } from "./GroupCategoryTabs";
import { type GroupTab, useMetabotGroupPermissions } from "./utils";

export function MetabotFeatureAccessPage() {
  const isUsingTenants = useSetting("use-tenants");
  const [activeTab, setActiveTab] = useState<GroupTab>("user-groups");
  const [enableModalOpen, setEnableModalOpen] = useState(false);
  const [disableModalOpen, setDisableModalOpen] = useState(false);

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
    <SettingsPageWrapper mt="sm">
      <Group justify="space-between" w="100%">
        <Title order={1}>{t`AI feature access`}</Title>
        {advanced && (
          <Menu position="bottom-end">
            <Menu.Target>
              <ActionIcon variant="subtle" aria-label={t`Settings`}>
                <Icon name="gear" />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item onClick={() => setDisableModalOpen(true)}>
                {t`Remove group-level access`}
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        )}
      </Group>

      {isUsingTenants && (
        <GroupCategoryTabs setActiveTab={setActiveTab} activeTab={activeTab} />
      )}

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

      {!advanced && (
        <Group>
          <Button
            variant="filled"
            onClick={() => setEnableModalOpen(true)}
          >{t`Set group-level permissions`}</Button>
        </Group>
      )}

      <EnableAdvancedModal
        opened={enableModalOpen}
        onClose={() => setEnableModalOpen(false)}
      />
      <DisableAdvancedModal
        opened={disableModalOpen}
        onClose={() => setDisableModalOpen(false)}
      />
    </SettingsPageWrapper>
  );
}
