import { t } from "ttag";

import { Center, Text } from "metabase/ui";

export function BrokenItemsPage() {
  return (
    <Center h="100%" bg="bg-light">
      <Text c="text-medium">{t`Broken items will be listed here`}</Text>
    </Center>
  );
}
