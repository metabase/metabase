import { c } from "ttag";

import { CollectionEmptyIcon } from "metabase/collections/components/CollectionEmptyState/CollectionEmptyState";
import { Flex, Text } from "metabase/ui";

export const CleanupEmptyState = ({ duration }: { duration: string }) => (
  <Flex
    align="center"
    justify="center"
    direction="column"
    style={{ flexGrow: 1 }}
    pt="2rem"
    pb="3rem"
  >
    <CollectionEmptyIcon />
    <Text fw="bold" size="1.25rem" mt="4rem">
      {c("{0} is a duration of time (e.g.: 2 months)")
        .t`All items have been used in the past ${duration}`}
    </Text>
  </Flex>
);
