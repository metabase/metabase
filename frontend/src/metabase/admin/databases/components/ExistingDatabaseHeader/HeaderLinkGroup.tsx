import { useState } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import { isSyncInProgress } from "metabase/lib/syncing";
import { browseDatabase } from "metabase/lib/urls";
import { RepresentationsModal } from "metabase/representations/RepresentationsModal";
import { Button, Flex, Icon } from "metabase/ui";
import type { Database } from "metabase-types/api";

interface Props {
  database: Database;
}

export const HeaderLinkGroup = ({ database }: Props) => {
  const [isRepresentationsModalOpen, setIsRepresentationsModalOpen] =
    useState(false);
  const isSyncing = isSyncInProgress(database);

  return (
    <>
      <Flex gap="0.5rem">
        <Button
          fw="bold"
          onClick={() => setIsRepresentationsModalOpen(true)}
          variant="subtle"
          data-testid="representations-button"
        >
          {t`Representations`}
        </Button>
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
      <RepresentationsModal
        opened={isRepresentationsModalOpen}
        onClose={() => setIsRepresentationsModalOpen(false)}
        entityId={database.id}
        entityType="database"
      />
    </>
  );
};
