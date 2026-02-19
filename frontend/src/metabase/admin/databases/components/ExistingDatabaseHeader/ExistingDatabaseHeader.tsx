import { c } from "ttag";

import { getEngines } from "metabase/databases/selectors";
import { useSelector } from "metabase/lib/redux";
import { Flex, Stack, Text, Title } from "metabase/ui";
import type { Database } from "metabase-types/api";
import { isEngineKey } from "metabase-types/guards";

import { HeaderLinkGroup } from "./HeaderLinkGroup";

export const ExistingDatabaseHeader = ({
  database,
}: {
  database: Database;
}) => {
  const engines = useSelector(getEngines);
  const engineKey = isEngineKey(database.engine) ? database.engine : undefined;
  const driverName = engineKey
    ? engines[engineKey]?.["driver-name"]
    : undefined;

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
        <Flex gap="sm">
          {driverName && (
            <Text size="sm" c="text-secondary">
              {driverName}
            </Text>
          )}
          <Text size="sm" c="text-secondary">
            {c(
              "Date on which the database was added to Metabase (e.g. Added 3/4/2025)",
            ).t`Added ${new Intl.DateTimeFormat(undefined, {
              year: "numeric",
              month: "long",
              day: "numeric",
            }).format(new Date(database.created_at))}`}
          </Text>
        </Flex>
      </Stack>
      <HeaderLinkGroup database={database} />
    </Flex>
  );
};
