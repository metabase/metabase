import { t } from "ttag";

import { isSyncInProgress } from "metabase/lib/syncing";
import { browseDatabase } from "metabase/lib/urls";
import { useNavigation } from "metabase/routing";
import { Button, Flex, Icon } from "metabase/ui";
import type { Database } from "metabase-types/api";

interface Props {
  database: Database;
}

export const HeaderLinkGroup = ({ database }: Props) => {
  const { push } = useNavigation();
  const isSyncing = isSyncInProgress(database);

  return (
    <Flex gap="0.5rem">
      <Button
        fw="bold"
        variant="subtle"
        onClick={() => push(`/admin/permissions/data/database/${database.id}`)}
      >
        {t`Manage permissions`}
      </Button>
      <Button
        component={isSyncing ? undefined : "a"}
        disabled={isSyncing}
        fw="bold"
        rightSection={<Icon name="external" />}
        target="_blank"
        title={isSyncing ? t`Sync in progress` : undefined}
        href={browseDatabase(database)}
        variant="subtle"
      >
        {t`Browse data`}
      </Button>
    </Flex>
  );
};
