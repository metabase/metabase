import { Link } from "react-router";
import { t } from "ttag";

import * as Urls from "metabase/lib/urls";
import { Box, FixedSizeIcon, Group, Text } from "metabase/ui";
import type { Collection, Table } from "metabase-types/api";

import { getLibraryCollectionType } from "../../../utils";

import S from "./TableCollection.module.css";
import { TableSectionGroup } from "./TableSectionGroup";

interface Props {
  table: Table;
}

export function TableCollection({ table }: Props) {
  const { collection } = table;

  return (
    <TableSectionGroup title={t`This table has been published`}>
      <Box
        className={S.collection}
        component={Link}
        to={getCollectionLink(collection) ?? ""}
      >
        <Group gap={8} wrap="nowrap" align="flex-start">
          <FixedSizeIcon name={collection ? "folder" : "key"} c="brand" />
          <Text fw="bold" size="md" lh="md" className={S.collectionName}>
            {collection
              ? collection.name
              : t`You don't have access to this collection`}
          </Text>
        </Group>
      </Box>
    </TableSectionGroup>
  );
}

function getCollectionLink(collection: Collection | null | undefined) {
  if (collection != null) {
    return getLibraryCollectionType(collection.type) != null
      ? Urls.dataStudioCollection(collection.id)
      : Urls.collection(collection);
  }
}
