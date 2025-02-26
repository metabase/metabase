import { c } from "ttag";

import { getEngineLogo } from "metabase/databases/utils/engine";
import { Flex, Icon, Image, Text, Title } from "metabase/ui";
import type Database from "metabase-lib/v1/metadata/Database";

export const ExistingDatabaseHeader = ({
  database,
}: {
  database: Database;
}) => {
  const engineLogo = database.engine
    ? getEngineLogo(database.engine)
    : undefined;

  return (
    <Flex mb="2.75rem" gap="1.25rem">
      <Flex
        w="2.75rem"
        h="2.75rem"
        bg="brand-light"
        styles={{ root: { borderRadius: ".5rem" } }}
        justify="center"
        align="center"
      >
        {engineLogo ? <Image src={engineLogo} /> : <Icon name="database" />}
      </Flex>

      <Flex direction="column" justify="space-between">
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
};
