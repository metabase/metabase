import { c } from "ttag";

import { getEngines } from "metabase/databases/selectors";
import { useSelector } from "metabase/lib/redux";
import { Flex, Stack, Text, Title } from "metabase/ui";
import type Database from "metabase-lib/v1/metadata/Database";

export const ExistingDatabaseHeader = ({
  database,
}: {
  database: Database;
}) => {
  const engines = useSelector(getEngines);
  const driverName = engines[database.engine ?? ""]?.["driver-name"];

  return (
    <Flex mb="2.75rem" gap="1.25rem" data-testid="database-header-section">
      <Stack gap="sm">
        <Title>{database?.name}</Title>
        <Flex gap="sm">
          {driverName && (
            <Text size="sm" c="text-medium">
              {driverName}
            </Text>
          )}
          <Text size="sm" c="text-medium">
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
    </Flex>
  );
};
