import { t } from "ttag";

import { DataStudioBreadcrumbs } from "metabase/data-studio/common/components/DataStudioBreadcrumbs";
import { PageContainer } from "metabase/data-studio/common/components/PageContainer";
import { PaneHeader } from "metabase/data-studio/common/components/PaneHeader";
import { usePageTitle } from "metabase/hooks/use-page-title";
import { Card, Flex, Stack, Switch, Text } from "metabase/ui";

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
      <Stack align="center">
        {settings.map((setting) => (
          <Setting key={setting.key} setting={setting} />
        ))}
      </Stack>
    </PageContainer>
  );
}

function Setting({ setting }: { setting: DataStudioSetting }) {
  const { value, handleChange } = useLocalSetting(setting.key, setting.value);

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
