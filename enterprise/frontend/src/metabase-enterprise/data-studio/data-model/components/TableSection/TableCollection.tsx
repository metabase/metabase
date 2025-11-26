import { useDisclosure } from "@mantine/hooks";
import { Link } from "react-router";
import { t } from "ttag";

import * as Urls from "metabase/lib/urls";
import { ActionIcon, Box, FixedSizeIcon, Group, Tooltip } from "metabase/ui";
import { UnpublishTablesModal } from "metabase-enterprise/data-studio/common/components/UnpublishTablesModal";
import type { Table } from "metabase-types/api";

import S from "./TableCollection.module.css";
import { TableSectionGroup } from "./TableSectionGroup";

type TableCollectionProps = {
  table: Table;
};

export function TableCollection({ table }: TableCollectionProps) {
  const { collection } = table;
  const [isModalOpened, { open: openModal, close: closeModal }] =
    useDisclosure();

  return (
    <>
      <TableSectionGroup title={t`This table has been published`}>
        <Group justify="space-between" wrap="nowrap">
          {collection != null ? (
            <Link
              className={S.link}
              to={Urls.dataStudioCollection(collection.id)}
            >
              {collection.name}
            </Link>
          ) : (
            <Box>{t`You don't have access to this collection`}</Box>
          )}
          <Tooltip label={t`Unpublish`}>
            <ActionIcon aria-label={t`Unpublish`} onClick={openModal}>
              <FixedSizeIcon name="unpublish" />
            </ActionIcon>
          </Tooltip>
        </Group>
      </TableSectionGroup>
      {isModalOpened && (
        <UnpublishTablesModal tableIds={[table.id]} onClose={closeModal} />
      )}
    </>
  );
}
