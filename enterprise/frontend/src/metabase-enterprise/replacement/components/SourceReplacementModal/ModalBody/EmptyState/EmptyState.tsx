import { t } from "ttag";

import { Center, FixedSizeIcon, Stack, Text } from "metabase/ui";

export function EmptyState() {
  return (
    <Center flex={1}>
      <Stack align="center" gap="xl">
        <Center w="5rem" h="5rem" bg="background_surface-disabled" bdrs="50%">
          <FixedSizeIcon name="list" c="icon-disabled" />
        </Center>
        <Text ta="center">{t`The items that will be affected will show up here.`}</Text>
      </Stack>
    </Center>
  );
}
