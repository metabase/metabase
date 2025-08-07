import { useState } from "react";
import { t } from "ttag";

import { Stack, Text, Title } from "metabase/ui";
import { useGetDatabaseReplicationQuery } from "metabase-enterprise/api/database-replication";
import type { Database } from "metabase-types/api";

export const DatabaseReplicationSettingUp = ({
  database,
  proceed,
}: {
  database: Database;
  proceed: () => void;
}) => {
  // FIXME: Can be move this into DatabaseReplicationModal, next to the other HTTP requests?
  const [isPolling, setIsPolling] = useState(true);
  const { data } = useGetDatabaseReplicationQuery(
    {
      databaseId: database.id,
    },
    {
      skip: !isPolling,
      pollingInterval: 5000,
    },
  );

  if (data) {
    switch (data.status) {
      case "initializing":
        break;
      case "active":
        setIsPolling(false);
        proceed();
        break;
      case "error":
      case "paused":
        setIsPolling(false);
        // FIXME: Show error page
        break;
    }
  }

  return (
    <Stack align="center">
      <img
        src="app/assets/img/metabot-cloud-96x96.svg"
        alt="Metabot Cloud"
        style={{
          width: 96,
          height: 96,
        }}
      />

      <Stack align="center">
        <Title>{t`Setting up, please wait`}</Title>
        <Text>{t`This will take just a minute or so`}</Text>
      </Stack>
    </Stack>
  );
};
