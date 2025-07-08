import { jt, t } from "ttag";

import {
  DatabaseInfoSection,
  DatabaseInfoSectionDivider,
} from "metabase/admin/databases/components/DatabaseInfoSection";
import ExternalLink from "metabase/common/components/ExternalLink";
import { useSetting } from "metabase/common/hooks";
import { Flex, Text } from "metabase/ui";
import type { Database } from "metabase-types/api";

import { PgReplicationButton } from "./PgReplicationButton";
import { PgReplicationStatusInfo } from "./PgReplicationStatusInfo";

export function DatabaseDataReplicationSection({
  database,
}: {
  database: Database;
}) {
  const showPgReplication = useSetting("pg-replication-enabled");
  const isPgDatabase = database.engine === "postgres";

  if (!showPgReplication || !isPgDatabase) {
    return null;
  }

  const link = (
    <ExternalLink href="https://clickhouse.com/docs/integrations/clickpipes/postgres">
      {t`adjust settings and permissions`}
    </ExternalLink>
  );

  return (
    <DatabaseInfoSection
      condensed
      name={t`Data replication`}
      // eslint-disable-next-line no-literal-metabase-strings -- This string only shows for admins.
      description={t`Continuously sync the tables from this database with Metabase Cloud Storage - a fast managed database. Then query the copied tables instead of the originals.`}
    >
      <Flex align="center" justify="space-between" gap="lg">
        <PgReplicationStatusInfo databaseId={database.id} />
        <PgReplicationButton databaseId={database.id} />
      </Flex>

      <DatabaseInfoSectionDivider condensed />

      <Text size="sm" c="text-medium">
        {jt`Note: You may need to ${link} in the source database. The process might also require a database restart.`}
      </Text>
    </DatabaseInfoSection>
  );
}
