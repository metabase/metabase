import { t } from "ttag";

import { Box, Stack, Title } from "metabase/ui";

export function JobListPage() {
  return (
    <Stack gap="xl">
      <Stack gap="sm">
        <Title order={1}>{t`Jobs`}</Title>
        <Box>{t`Create custom tables with transforms, and run them on a schedule.`}</Box>
      </Stack>
    </Stack>
  );
}
