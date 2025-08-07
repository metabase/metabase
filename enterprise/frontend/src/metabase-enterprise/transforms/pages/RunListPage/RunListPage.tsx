import { t } from "ttag";

import { Box, Stack, Title } from "metabase/ui";

export function RunListPage() {
  return (
    <Stack gap="xl">
      <Stack gap="sm">
        <Title order={1}>{t`Runs`}</Title>
        <Box>{t`A list of when each transform ran.`}</Box>
      </Stack>
    </Stack>
  );
}
