import { t } from "ttag";

import { Group, Stack, Text, Title } from "metabase/ui";

import { NewTransformMenu } from "./NewTransformMenu";
import { TransformList } from "./TransformList";

export function TransformListPage() {
  return (
    <Stack gap="xl">
      <Group>
        <Stack gap="sm" flex={1}>
          <Title order={1}>{t`Transforms`}</Title>
          <Text>{t`Create custom tables with transforms, and run them on a schedule.`}</Text>
        </Stack>
        <NewTransformMenu />
      </Group>
      <TransformList />
    </Stack>
  );
}
