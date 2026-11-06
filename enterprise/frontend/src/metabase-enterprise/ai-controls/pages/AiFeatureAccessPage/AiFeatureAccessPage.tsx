import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { SettingsPageWrapper } from "metabase/settings-components";
import { Group, Stack, Text, Title } from "metabase/ui";
import {
  useDisableAdvancedAIControlsPermissionsMutation,
  useEnableAdvancedAIControlsPermissionsMutation,
} from "metabase-enterprise/api";

import { GearIconMenu } from "../../components/GearIconMenu";
import { GroupCategoryTabs } from "../../components/GroupCategoryTabs";
import { useAccessGroups, useAdvancedModeSwitch } from "../../hooks";

import { AiFeatureAccessTable } from "./components/AiFeatureAccessTable";
import { useMetabotGroupPermissions } from "./useMetabotGroupPermissions";

export function AiFeatureAccessPage() {
  const groups = useAccessGroups();
  const {
    groupPermissions,
    onPermissionChange,
    advanced,
    error: permissionsError,
  } = useMetabotGroupPermissions();

  const advancedMode = useAdvancedModeSwitch({
    enable: useEnableAdvancedAIControlsPermissionsMutation(),
    disable: useDisableAdvancedAIControlsPermissionsMutation(),
  });

  return (
    <SettingsPageWrapper mt="sm" gap="lg">
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Stack gap="sm">
          <Title order={1}>{t`AI feature access`}</Title>
          <Text c="text-secondary" lh={1.5} maw="40rem">
            {t`Choose which AI features each group can use. Administrators always have every feature.`}
          </Text>
        </Stack>
        {advanced && (
          <GearIconMenu
            loading={advancedMode.isDisabling}
            onConfirm={advancedMode.disable}
          />
        )}
      </Group>

      {groups.isUsingTenants && (
        <GroupCategoryTabs
          setActiveTab={groups.setActiveTab}
          activeTab={groups.activeTab}
        />
      )}

      <LoadingAndErrorWrapper
        loading={groups.isLoading}
        error={groups.error || permissionsError}
      >
        {groups.groups && (
          <AiFeatureAccessTable
            groups={groups.groups}
            groupPermissions={groupPermissions}
            onPermissionChange={onPermissionChange}
            advanced={advanced}
            activeTab={groups.activeTab}
            isEnablingAdvanced={advancedMode.isEnabling}
            onEnableAdvanced={advancedMode.enable}
          />
        )}
      </LoadingAndErrorWrapper>
    </SettingsPageWrapper>
  );
}
