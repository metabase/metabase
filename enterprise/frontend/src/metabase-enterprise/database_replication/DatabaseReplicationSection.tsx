import { t } from "ttag";

import {
  DatabaseInfoSection,
  DatabaseInfoSectionDivider,
} from "metabase/admin/databases/components/DatabaseInfoSection";
import { useSetting } from "metabase/common/hooks";
import { Flex } from "metabase/ui";
import type { Database } from "metabase-types/api";

import { DatabaseReplicationButton } from "./DatabaseReplicationButton";
import { DatabaseReplicationPostgresInfo } from "./DatabaseReplicationPostgresInfo";
import { DatabaseReplicationStatusInfo } from "./DatabaseReplicationStatusInfo";

function getEngineInfo(engine: string | undefined) {
  switch (engine) {
    case "postgres":
      return DatabaseReplicationPostgresInfo();
    default:
      return null;
  }
}

export function DatabaseReplicationSection({
  database,
}: {
  database: Database;
}) {
  const databaseReplicationEnabled = useSetting("database-replication-enabled");
  const databaseSupportsReplication = database.features?.includes(
    "database-replication",
  );

  if (!databaseReplicationEnabled || !databaseSupportsReplication) {
    return null;
  }

  const engineInfo = getEngineInfo(database.engine);

  return (
    <DatabaseInfoSection
      condensed
      name={t`Database replication`}
      // eslint-disable-next-line no-literal-metabase-strings -- This string only shows for admins.
      description={t`Continuously sync the tables from this database with Metabase Cloud Storage - a fast managed database. Then query the copied tables instead of the originals.`}
    >
      <Flex align="center" justify="space-between" gap="lg">
        <DatabaseReplicationStatusInfo databaseId={database.id} />
        <DatabaseReplicationButton databaseId={database.id} />
      </Flex>

      {engineInfo && (
        <>
          <DatabaseInfoSectionDivider condensed />
          {engineInfo}
        </>
      )}
    </DatabaseInfoSection>
  );
}
