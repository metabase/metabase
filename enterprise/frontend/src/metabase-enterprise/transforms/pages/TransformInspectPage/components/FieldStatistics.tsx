import { t } from "ttag";

import { Stack, Title } from "metabase/ui";

export function FieldStatistics() {
  return (
    <Stack gap="md">
      <Title order={3}>{t`Field Statistics`}</Title>
    </Stack>
  );
}
