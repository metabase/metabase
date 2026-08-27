import { t } from "ttag";

import { DataStudioBreadcrumbs } from "metabase/common/data-studio/components/DataStudioBreadcrumbs";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import { PaneHeader } from "metabase/common/data-studio/components/PaneHeader";
import { usePageTitle } from "metabase/hooks/use-page-title";
import { Card, Center, Flex, Stack, Switch, Text, Title } from "metabase/ui";

import { useDataStudioSettings, useLocalSetting } from "../../hooks";
import type { DataStudioSetting } from "../../types";

export function SettingsPage() {
  usePageTitle(t`Settings`);
  const settings = useDataStudioSettings();

  return (
    <PageContainer gap={0}>
      <PaneHeader
        breadcrumbs={
          <DataStudioBreadcrumbs role="heading">{t`Settings`}</DataStudioBreadcrumbs>
        }
      />
      <Stack flex={1} align="center">
        {settings.length > 0 ? (
          settings.map((setting) => (
            <Setting key={setting.key} setting={setting} />
          ))
        ) : (
          <SettingsEmptyState />
        )}
      </Stack>
    </PageContainer>
  );
}

function Setting({ setting }: { setting: DataStudioSetting }) {
  const { value, handleChange, isUpdating } = useLocalSetting(
    setting.key,
    setting.value,
  );

  const descriptionLines = setting.description.split("\n");

  return (
    <Card p="xl" withBorder shadow="none" maw="40rem" w="100%">
      <Stack>
        <Flex justify="space-between" align="center">
          <Text fz="lg" lh="md" fw={700}>
            {setting.name}
          </Text>
          {typeof value === "boolean" && (
            <Switch
              checked={value}
              onChange={(e) => handleChange(e.target.checked)}
              disabled={isUpdating}
              aria-label={setting.name}
              size="sm"
            />
          )}
        </Flex>
        <Stack gap="sm">
          {descriptionLines.map((line, index) => (
            <Text key={index} c="text-secondary" lh="sm">
              {line}
            </Text>
          ))}
        </Stack>
      </Stack>
    </Card>
  );
}

// DataStudioLayout gates on settings.length > 0, so a user shouldn't ever see this
// but show them something just in case they navigate directly to settings somehow
function SettingsEmptyState() {
  return (
    <Center flex={1}>
      <Stack align="center" maw="30rem" gap="md">
        <Title order={3} ta="center">
          {t`Nothing to configure yet`}
        </Title>
        <Text ta="center" c="text-secondary">
          {t`There aren't any settings for you to change right now.`}
        </Text>
      </Stack>
    </Center>
  );
}
