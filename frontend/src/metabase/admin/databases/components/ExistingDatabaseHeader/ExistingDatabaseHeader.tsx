import { Flex, Stack, Title } from "metabase/ui";
import type { Database } from "metabase-types/api";

import { DatabaseEngineAndAddedDate } from "../DatabaseEngineAndAddedDate";

import { HeaderLinkGroup } from "./HeaderLinkGroup";

export const ExistingDatabaseHeader = ({
  database,
}: {
  database: Database;
}) => {
  return (
    <Flex
      data-testid="database-header-section"
      gap="1.25rem"
      justify="space-between"
      mb="2.75rem"
      wrap="wrap"
    >
      <Stack gap="sm">
        <Title order={2}>{database?.name}</Title>
        <DatabaseEngineAndAddedDate database={database} />
      </Stack>
      <HeaderLinkGroup database={database} />
    </Flex>
  );
};
