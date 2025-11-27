import { t } from "ttag";

import { Center, Text } from "metabase/ui";

export function UnreferencedItemsPage() {
  return (
    <Center h="100%" bg="bg-light">
      <Text c="text-medium">{t`Unreferenced items will be listed here`}</Text>
    </Center>
  );
}
