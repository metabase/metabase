import { t } from "ttag";

import { Box, Group, Stack, Title } from "metabase/ui";

import { NewJobButton } from "./NewJobButton";

export function JobListPage() {
  return (
    <Stack gap="xl">
      <Group>
        <Stack gap="sm">
          <Title order={1}>{t`Jobs`}</Title>
          <Box>{t`Create custom tables with transforms, and run them on a schedule.`}</Box>
        </Stack>
        <NewJobButton />
      </Group>
    </Stack>
  );
}
