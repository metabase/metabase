import { t } from "ttag";

import { SettingsSection } from "metabase/admin/components/SettingsSection";
import { AdminSettingInput } from "metabase/admin/settings/components/widgets/AdminSettingInput";
import { useSetting } from "metabase/common/hooks";
import { Box, Flex, Stack, Text } from "metabase/ui";

export const GitSyncSettings = () => {
  return (
    <SettingsSection
      title={t`Git sync`}
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
        name="git-sync-key"
        title={t`API key`}
        inputType="text"
      />
      <AdminSettingInput
        name="git-sync-key"
        title={t`Repository name`}
        inputType="text"
      />
    </SettingsSection>
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
