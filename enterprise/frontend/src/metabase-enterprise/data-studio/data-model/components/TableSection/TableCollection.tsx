import { Link } from "react-router";
import { t } from "ttag";

import * as Urls from "metabase/lib/urls";
import { ActionIcon, Box, FixedSizeIcon, Group, Tooltip } from "metabase/ui";
import { useUnpublishTables } from "metabase-enterprise/data-studio/common/hooks/use-unpublish-tables";
import type { Table } from "metabase-types/api";

import S from "./TableCollection.module.css";
import { TableSectionGroup } from "./TableSectionGroup";

type TableCollectionProps = {
  table: Table;
};

export function TableCollection({ table }: TableCollectionProps) {
  const { collection } = table;
  const { unpublishConfirmationModal, handleUnpublish } = useUnpublishTables();

  return (
    <>
      <TableSectionGroup title={t`This table has been published`}>
        <Group justify="space-between" wrap="nowrap">
          {collection != null ? (
            <Box
              className={S.link}
              component={Link}
              to={Urls.dataStudioCollection(collection.id)}
              fw="bold"
            >
              {collection.name}
            </Box>
          ) : (
            <Box>{t`You don't have access to this collection`}</Box>
          )}
          <Tooltip label={t`Unpublish`}>
            <ActionIcon
              aria-label={t`Unpublish`}
              onClick={() => handleUnpublish({ tableIds: [table.id] })}
            >
              <FixedSizeIcon name="unpublish" />
            </ActionIcon>
          </Tooltip>
        </Group>
      </TableSectionGroup>
      {unpublishConfirmationModal}
    </>
  );
}
