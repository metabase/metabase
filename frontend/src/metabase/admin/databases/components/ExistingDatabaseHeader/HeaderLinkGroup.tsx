import { Link } from "react-router";
import { t } from "ttag";

import { isSyncInProgress } from "metabase/lib/syncing";
import { browseDatabase } from "metabase/lib/urls";
import { Button, Flex, Icon } from "metabase/ui";
import type { Database } from "metabase-types/api";

interface Props {
  database: Database;
}

export const HeaderLinkGroup = ({ database }: Props) => (
  <Flex gap="2.5rem">
    <Button
      component={Link}
      fw="bold"
      p={0}
      to={`/admin/permissions/data/database/${database.id}`}
      variant="subtle"
    >
      {t`Manage permissions`}
    </Button>
    <Button
      component={Link}
      disabled={isSyncInProgress(database)}
      fw="bold"
      p={0}
      rightSection={<Icon name="external" />}
      target="_blank"
      to={browseDatabase(database)}
      variant="subtle"
    >
      {t`Browse data`}
    </Button>
  </Flex>
);
