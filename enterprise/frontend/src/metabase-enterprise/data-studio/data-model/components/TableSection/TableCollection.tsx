import { useDisclosure } from "@mantine/hooks";
import { Link } from "react-router";
import { t } from "ttag";

import * as Urls from "metabase/lib/urls";
import { ActionIcon, Box, FixedSizeIcon, Group, Tooltip } from "metabase/ui";
import type {
  Collection,
  CollectionEssentials,
  Table,
} from "metabase-types/api";

import { getLibraryCollectionType } from "../../../utils";
import { UnpublishTablesModal } from "../TablePicker/components/UnpublishTablesModal";

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
            <TableCollectionBreadcrumbs collection={collection} />
          ) : (
            <Box>{t`You don't have access to this collection`}</Box>
          )}
          <Tooltip label={t`Unpublish`}>
            <ActionIcon aria-label={t`Unpublish`} onClick={openModal}>
              <FixedSizeIcon name="library" />
            </ActionIcon>
          </Tooltip>
        </Group>
      </TableSectionGroup>
      <UnpublishTablesModal
        tables={new Set([table.id])}
        isOpen={isModalOpened}
        onClose={closeModal}
      />
    </>
  );
}

type TableCollectionBreadcrumbsProps = {
  collection: Collection;
};

function TableCollectionBreadcrumbs({
  collection,
}: TableCollectionBreadcrumbsProps) {
  return (
    <Group gap="xs" fw="bold">
      <Link className={S.link} to={getCollectionLink(collection)}>
        {collection.name}
      </Link>
    </Group>
  );
}

function getCollectionLink(collection: CollectionEssentials) {
  return getLibraryCollectionType(collection.type) != null
    ? Urls.dataStudioCollection(collection.id)
    : Urls.collection(collection);
}
