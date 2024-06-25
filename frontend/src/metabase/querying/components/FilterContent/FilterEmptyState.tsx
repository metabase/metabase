import { t } from "ttag";

import { Icon, Stack, Text } from "metabase/ui";

export function FilterEmptyState() {
  return (
    <Stack c="text-light" h="100%" justify="center" align="center">
      <Icon name="search" size={40} />
      <Text c="text-medium" mt="lg" fw="bold">{t`Didn't find anything`}</Text>
    </Stack>
  );
}
