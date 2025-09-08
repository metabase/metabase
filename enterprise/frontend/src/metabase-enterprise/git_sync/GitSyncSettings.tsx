import { t } from "ttag";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import { AdminSettingInput } from "metabase/admin/settings/components/widgets/AdminSettingInput";
import { useSetting } from "metabase/common/hooks";
import { Box, Flex, Stack, Text } from "metabase/ui";

export const GitSyncSettings = () => {
  return (
    <SettingsPageWrapper title={t`Library configuration`}>
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
        <AdminSettingInput
          name="git-sync-allow-edit"
          // eslint-disable-next-line
          description={t`Whether editing library content is allowed from this Metabase instance. We recommend only enabling this on development or staging instances.`}
          title={t`Allow editing library content`}
          inputType="boolean"
        />
        <AdminSettingInput
          name="git-sync-import-branch"
          // eslint-disable-next-line
          description={t`Metabase will pull library content from this branch`}
          title={t`Default import branch`}
          inputType="text"
          w="20rem"
        />
        <AdminSettingInput
          name="git-sync-export-branch"
          // eslint-disable-next-line
          description={t`Metabase will push library content to this branch`}
          title={t`Default export branch`}
          inputType="text"
          w="20rem"
        />
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
