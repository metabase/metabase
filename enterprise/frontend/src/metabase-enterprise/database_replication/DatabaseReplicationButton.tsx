import { t } from "ttag";

import ActionButton from "metabase/common/components/ActionButton";
import { useSetting } from "metabase/common/hooks";
import {
  useCreateDatabaseReplicationMutation,
  useDeleteDatabaseReplicationMutation,
} from "metabase-enterprise/api/database-replication";
import type { DatabaseId } from "metabase-types/api";

export function DatabaseReplicationButton({
  databaseId,
}: {
  databaseId: DatabaseId;
}) {
  const showDatabaseReplication = useSetting("database-replication-enabled");
  const connections = useSetting("database-replication-connections");

  const [createDatabaseReplication] = useCreateDatabaseReplicationMutation();
  const [deleteDatabaseReplication] = useDeleteDatabaseReplicationMutation();

  const hasConnection = connections?.[databaseId] != null;

  if (!showDatabaseReplication) {
    return null;
  }

  const handleCreateReplication = () => {
    return createDatabaseReplication(databaseId).unwrap();
  };

  const handleDeleteReplication = () => {
    return deleteDatabaseReplication(databaseId).unwrap();
  };

  // Note: the api call will invalidate the session, which updates the setting, which swaps the buttons.
  // When the button is swapped midway, it will use the other button's success text.
  // So both buttons have the same innocuous success text.
  if (hasConnection) {
    return (
      <ActionButton
        actionFn={handleDeleteReplication}
        normalText={t`Stop replicating to Data Warehouse`}
        activeText={t`Stopping…`}
        failedText={t`Failed to stop replication`}
        successText={t`Done!`}
      />
    );
  }

  return (
    <ActionButton
      actionFn={handleCreateReplication}
      normalText={t`Replicate to Data Warehouse`}
      activeText={t`Starting…`}
      failedText={t`Failed to replicate`}
      successText={t`Done!`}
    />
  );
}
