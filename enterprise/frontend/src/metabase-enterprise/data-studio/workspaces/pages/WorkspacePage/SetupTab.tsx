import { t } from "ttag";

import { Stack, Text, Title } from "metabase/ui";

interface SetupTabProps {
  databaseName?: string;
}

export const SetupTab = ({ databaseName }: SetupTabProps) => {
  return (
    <Stack gap="lg">
      <Stack gap="xs">
        <Title order={3}>{t`Workspace Setup`}</Title>
        <Text c="text-medium">
          {t`Configure your data warehouse connection for this workspace`}
        </Text>
      </Stack>

      <Stack gap="xs">
        <Text fw={600}>{t`Data Warehouse`}</Text>
        <Text>
          <code>{databaseName}</code>
        </Text>
        <Text c="text-light" size="sm">
          {t`Data warehouse selection is locked after editing or timeout`}
        </Text>
      </Stack>
    </Stack>
  );
};
