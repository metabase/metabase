import { t } from "ttag";

import { Stack, Title } from "metabase/ui";

export function TransformRunListPage() {
  return (
    <Stack gap="xl">
      <Title order={1}>{t`Runs`}</Title>
    </Stack>
  );
}
