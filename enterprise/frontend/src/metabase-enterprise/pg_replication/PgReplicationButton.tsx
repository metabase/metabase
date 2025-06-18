import { t } from "ttag";

import ActionButton from "metabase/common/components/ActionButton";
import { useSetting } from "metabase/common/hooks";
import {
  useCreatePgReplicationMutation,
  useDeletePgReplicationMutation,
} from "metabase-enterprise/api/pg-replication";
import type { DatabaseId } from "metabase-types/api";

type PgReplicationConnections = Record<DatabaseId, { connection_id: string }>;

export function PgReplicationButton({
  databaseId,
}: {
  databaseId: DatabaseId;
}) {
  const showPgReplication = useSetting("pg-replication-enabled");
  const connections = useSetting("pg-replication-connections") as
    | PgReplicationConnections
    | undefined;

  const [createPgReplication] = useCreatePgReplicationMutation();
  const [deletePgReplication] = useDeletePgReplicationMutation();

  const hasConnection = connections?.[databaseId] != null;

  if (!showPgReplication) {
    return null;
  }

  const handleCreateReplication = () => {
    return createPgReplication(databaseId).unwrap();
  };

  const handleDeleteReplication = () => {
    return deletePgReplication(databaseId).unwrap();
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
