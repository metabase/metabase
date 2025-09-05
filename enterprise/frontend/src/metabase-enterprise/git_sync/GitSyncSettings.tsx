import { t } from "ttag";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import { AdminSettingInput } from "metabase/admin/settings/components/widgets/AdminSettingInput";
import ActionButton from "metabase/common/components/ActionButton";
import { useSetting } from "metabase/common/hooks";
import { Box, Flex, Group, Icon, Stack, Text } from "metabase/ui";
import { useImportGitMutation } from "metabase-enterprise/api";

export const GitSyncSettings = () => {
  const [importGit, { isLoading: isImporting }] = useImportGitMutation();

  const isLoading = isImporting;

  return (
    <SettingsPageWrapper title={t`Git sync settings`}>
      <SettingsSection
        title={t`Configure git`}
        description={
          <Stack gap="xs">
            <Text>
              {/* eslint-disable-next-line */}
              {t`Enable Git sync to back up and version control your Metabase library.`}
            </Text>
            <GitSyncStatus />
          </Stack>
        }
      >
        <AdminSettingInput
          name="git-sync-url"
          title={t`Git Url`}
          inputType="text"
        />
        <AdminSettingInput
          name="git-sync-token"
          title={t`Github PAT`}
          inputType="password"
        />
      </SettingsSection>
      <SettingsSection
        title={t`Sync control`}
        description={t`Manually trigger a git sync to push any local changes to the remote repository and pull down any changes from the remote repository.`}
      >
        <Flex gap="md" align="end">
          <AdminSettingInput
            name="git-sync-import-branch"
            // eslint-disable-next-line
            description={t`Metabase will pull in all content from this branch`}
            title={t`Import branch`}
            inputType="text"
            w="20rem"
          />
          <ActionButton
            primary
            actionFn={() => importGit({}).unwrap()}
            variant="filled"
            failedText={t`Sync failed`}
            activeText={t`Syncing...`}
            successText={t`Synced`}
            useLoadingSpinner
            disabled={isLoading}
          >
            <Group align="center" gap="sm">
              <Icon name="download" />
              {t`Import`}
            </Group>
          </ActionButton>
        </Flex>
      </SettingsSection>
    </SettingsPageWrapper>
  );
};

const GitSyncStatus = () => {
  const syncStatus = useSetting("git-sync-configured");

  const color = syncStatus ? "success" : "error";
  const message = syncStatus
    ? t`Git sync is configured.`
    : t`Git sync is not configured.`;

  return (
    <Flex align={"center"}>
      <Box bdrs="50%" h="14" w="14" mr="sm" bg={color} />
      <Text c="text-medium">{message}</Text>
    </Flex>
  );
};
