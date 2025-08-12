import { t } from "ttag";

import { Box, Group, Stack, Title } from "metabase/ui";

import { NewTransformMenu } from "./NewTransformMenu";
import { TransformList } from "./TransformList";

export function TransformListPage() {
  return (
    <Stack gap="xl" data-testid="transform-list-page">
      <Group justify="space-between">
        <Stack gap="sm" flex={1}>
          <Title order={1}>{t`Transforms`}</Title>
          <Box>{t`Create custom tables with transforms, and run them on a schedule.`}</Box>
        </Stack>
        <NewTransformMenu />
      </Group>
      <TransformList />
    </Stack>
  );
}
