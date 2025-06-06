import { t } from "ttag";

import { ActionIcon, Card, Group, Icon, Text } from "metabase/ui";

export const SelectEntityStep = () => (
  <Card p="md" mb="md">
    <Group justify="space-between" mb="md">
      <Text size="lg" fw="bold">
        {t`Select a dashboard to embed`}
      </Text>
      <ActionIcon variant="outline" size="lg" title={t`Browse dashboards`}>
        <Icon name="search" size={16} />
      </ActionIcon>
    </Group>
    <Text c="text-medium" mb="md">
      {t`Choose from your recently visited dashboards`}
    </Text>
  </Card>
);
