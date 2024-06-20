import { t } from "ttag";

import { CollectionEmptyIcon } from "metabase/collections/components/CollectionEmptyState/CollectionEmptyState";
import { Flex, Text } from "metabase/ui";

export const CleanupCleanState = ({ duration }: { duration: string }) => {
  return (
    <Flex align="center" direction="column" pt="10rem" pb="12rem">
      <CollectionEmptyIcon />
      <Text fw="bold" size="1.25rem" mt="4rem">
        {t`We didn’t find any items not viewed in over ${duration}`}
      </Text>
    </Flex>
  );
};
