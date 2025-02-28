import { c } from "ttag";

import { Flex, Text, Title } from "metabase/ui";
import type Database from "metabase-lib/v1/metadata/Database";

export const ExistingDatabaseHeader = ({
  database,
}: {
  database: Database;
}) => (
  <Flex mb="2.75rem" gap="1.25rem">
    <Flex direction="column" justify="space-between" gap="sm">
      <Title>{database?.name}</Title>
      <Flex gap="sm">
        <Text size="sm" c="text-medium">
          {database.displayName()}
        </Text>
        <Text size="sm" c="text-medium">
          {c("Testing")
            .t`Added ${new Intl.DateTimeFormat().format(new Date(database.created_at))}`}
        </Text>
      </Flex>
    </Flex>
  </Flex>
);
