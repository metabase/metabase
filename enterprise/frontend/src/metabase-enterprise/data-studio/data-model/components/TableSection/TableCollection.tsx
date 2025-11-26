import { Fragment } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import * as Urls from "metabase/lib/urls";
import { ActionIcon, Box, FixedSizeIcon, Group, Tooltip } from "metabase/ui";
import type { CollectionEssentials, Table } from "metabase-types/api";

import { getLibraryCollectionType } from "../../../utils";

import S from "./TableCollection.module.css";
import { TableSectionGroup } from "./TableSectionGroup";

interface Props {
  table: Table;
}

export function TableCollection({ table }: Props) {
  const { collection } = table;
  const parentCollections = (collection?.effective_ancestors ?? [])
    .filter((ancestor) => ancestor.id !== "root")
    .toReversed();

  return (
    <TableSectionGroup title={t`This table has been published`}>
      <Group justify="space-between" wrap="nowrap">
        {collection != null ? (
          <Group gap="xs" fw="bold">
            {parentCollections.map((parentCollection) => (
              <Fragment key={parentCollection.id}>
                <Link
                  className={S.link}
                  to={getCollectionLink(parentCollection)}
                >
                  {parentCollection.name}
                </Link>
                {"/"}
              </Fragment>
            ))}
            <Link className={S.link} to={getCollectionLink(collection)}>
              {collection.name}
            </Link>
          </Group>
        ) : (
          <Box>{t`You don't have access to this collection`}</Box>
        )}
        <Tooltip label={t`Un-publish`}>
          <ActionIcon aria-label={t`Un-publish`}>
            <FixedSizeIcon name="library" />
          </ActionIcon>
        </Tooltip>
      </Group>
    </TableSectionGroup>
  );
}

function getCollectionLink(collection: CollectionEssentials) {
  return getLibraryCollectionType(collection.type) != null
    ? Urls.dataStudioCollection(collection.id)
    : Urls.collection(collection);
}
