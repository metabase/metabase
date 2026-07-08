import { useState } from "react";
import { t } from "ttag";

import {
  DatabaseInfoSection,
  DatabaseInfoSectionDivider,
} from "metabase/admin/databases/components/DatabaseInfoSection";
import { useSetting } from "metabase/common/hooks";
import { Button, Flex, Icon } from "metabase/ui";
import { useDeleteDatabaseReplicationMutation } from "metabase-enterprise/api/database-replication";
import type { Database } from "metabase-types/api";

import { DatabaseReplicationModal } from "./DatabaseReplicationModal";
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
  const [showDWHReplicationModal, setShowDWHReplicationModal] =
    useState<boolean>(false);
  const connections = useSetting("database-replication-connections");
  const databaseReplicationEnabled = useSetting("database-replication-enabled");
  const [deleteDatabaseReplication, { isLoading: isDeleting }] =
    useDeleteDatabaseReplicationMutation();
  const databaseSupportsReplication = database.features?.includes(
    "database-replication",
  );

  if (!databaseReplicationEnabled || !databaseSupportsReplication) {
    return null;
  }

  const engineInfo = getEngineInfo(database.engine);
  const hasConnection = connections?.[database.id] != null;
  const onDelete = async () => {
    await deleteDatabaseReplication(database.id).unwrap();
  };

  return (
    <DatabaseInfoSection
      condensed
      name={t`Database replication`}
      // eslint-disable-next-line metabase/no-literal-metabase-strings -- This string only shows for admins.
      description={t`Continuously sync the tables from this database with Metabase Cloud Storage - a fast managed database. Then query the copied tables instead of the originals.`}
    >
      <Flex align="center" justify="space-between" gap="lg">
        <DatabaseReplicationStatusInfo databaseId={database.id} />
        {hasConnection ? (
          <Button
            onClick={onDelete}
            loaderProps={{ children: t`Stopping…` }}
            loading={isDeleting}
            leftSection={<Icon name="trash" />}
          >{t`Stop replicating to Data Warehouse`}</Button>
        ) : (
          <Button
            onClick={() => setShowDWHReplicationModal(true)}
          >{t`Set up replication`}</Button>
        )}
        <DatabaseReplicationModal
          database={database}
          opened={showDWHReplicationModal}
          onClose={() => setShowDWHReplicationModal(false)}
        />
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
