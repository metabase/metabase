import { Link } from "react-router";
import { t } from "ttag";

import { Button, Flex, Icon } from "metabase/ui";
import { browseDatabase } from "metabase/urls";
import { isSyncInProgress } from "metabase/utils/syncing";
import type { Database } from "metabase-types/api";

interface Props {
  database: Database;
}

export const HeaderLinkGroup = ({ database }: Props) => {
  const isSyncing = isSyncInProgress(database);

  return (
    <Flex gap="0.5rem">
      <Button
        component={Link}
        fw="bold"
        to={`/admin/permissions/data/database/${database.id}`}
        variant="subtle"
      >
        {t`Manage permissions`}
      </Button>
      <Button
        component={isSyncing ? undefined : Link}
        disabled={isSyncing}
        fw="bold"
        rightSection={<Icon name="external" />}
        target="_blank"
        title={isSyncing ? t`Sync in progress` : undefined}
        to={browseDatabase(database)}
        variant="subtle"
      >
        {t`Browse data`}
      </Button>
    </Flex>
  );
};
