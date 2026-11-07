import { c } from "ttag";

import { useListEnginesQuery } from "metabase/api";
import { Flex, Text } from "metabase/ui";
import type { Database } from "metabase-types/api";
import { isEngineKey } from "metabase-types/guards";

/**
 * The database's engine name (when known) and the date it was added to Metabase.
 */
export const DatabaseEngineAndAddedDate = ({
  database,
}: {
  database: Pick<Database, "engine" | "created_at">;
}) => {
  const { data: engines = {} } = useListEnginesQuery();
  const driverName = isEngineKey(database.engine)
    ? engines[database.engine]?.["driver-name"]
    : undefined;

  return (
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
  );
};
