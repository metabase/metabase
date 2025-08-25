import { t } from "ttag";

import { SettingsSection } from "metabase/admin/components/SettingsSection";
import { AdminSettingInput } from "metabase/admin/settings/components/widgets/AdminSettingInput";
import Markdown from "metabase/common/components/Markdown";
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
        name="github-api-key"
        description={
          <Markdown>
            {t`Create a [Github personal access token](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens) with "repo" scope.`}
          </Markdown>
        }
        title={t`API key`}
        inputType="text"
      />
      <AdminSettingInput
        name="github-repo-name"
        /* eslint-disable-next-line */
        description={t`The name of the repository where Metabase will store your library data.`}
        title={t`Repository name`}
        inputType="text"
      />
    </SettingsSection>
  );
};

const GitSyncStatus = () => {
  const syncStatus = useSetting("github-sync-configured");

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
