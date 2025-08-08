import { t } from "ttag";

import { Box, Group, Stack, Title } from "metabase/ui";

import { CreateJobButton } from "./CreateJobButton";
import { JobList } from "./JobList";

export function JobListPage() {
  return (
    <Stack gap="xl">
      <Group justify="space-between">
        <Stack gap="sm">
          <Title order={1}>{t`Jobs`}</Title>
          <Box>{t`Create custom tables with transforms, and run them on a schedule.`}</Box>
        </Stack>
        <CreateJobButton />
      </Group>
      <JobList />
    </Stack>
  );
}
