import { t } from "ttag";

import { Center, FixedSizeIcon, Stack, Text } from "metabase/ui";

export function EmptyState() {
  return (
    <Center flex={1}>
      <Stack gap="xl">
        <Center w="5rem" h="5rem" bg="background-disabled" bdrs="50%">
          <FixedSizeIcon name="list" c="icon-disabled" />
        </Center>
        <Text>{t`The items that will be affected will show up here.`}</Text>
      </Stack>
    </Center>
  );
}
