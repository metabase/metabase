import { skipToken } from "@reduxjs/toolkit/query";
import { Fragment } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import {
  useGetCollectionQuery,
  useListDatabaseSchemasQuery,
} from "metabase/api";
import { Ellipsified } from "metabase/common/components/Ellipsified";
import * as Urls from "metabase/lib/urls";
import { getCollectionList } from "metabase/nav/components/CollectionBreadcrumbs/utils";
import { Flex, Group } from "metabase/ui";
import type { Segment, Table } from "metabase-types/api";

import S from "./SegmentBreadcrumbs.module.css";

type SegmentBreadcrumbsProps = {
  table: Table;
  segment?: Segment;
};

export function PublishedTableSegmentBreadcrumbs({
  table,
  segment,
}: SegmentBreadcrumbsProps) {
  const { data: collection } = useGetCollectionQuery(
    table.collection_id != null ? { id: table.collection_id } : skipToken,
  );

  const ancestors = collection ? getCollectionList({ collection }) : [];

  return (
    <Group className={S.breadcrumbs} gap="sm" wrap="nowrap" px="lg" pt="md">
      {ancestors.map((ancestor, index) => (
        <Fragment key={ancestor.id}>
          {index > 0 && <Separator />}
          <BreadcrumbLink to={Urls.dataStudioCollection(ancestor.id)}>
            <Ellipsified>{ancestor.name}</Ellipsified>
          </BreadcrumbLink>
        </Fragment>
      ))}

      {collection && (
        <>
          {ancestors.length > 0 && <Separator />}
          <BreadcrumbLink to={Urls.dataStudioCollection(collection.id)}>
            <Ellipsified>{collection.name}</Ellipsified>
          </BreadcrumbLink>
        </>
      )}

      <Separator />
      <BreadcrumbLink to={Urls.dataStudioTableSegments(table.id)}>
        <Ellipsified>{table.display_name}</Ellipsified>
      </BreadcrumbLink>

      <Separator />
      <BreadcrumbText>
        <Ellipsified>{segment?.name ?? t`New segment`}</Ellipsified>
      </BreadcrumbText>
    </Group>
  );
}

export function DataModelSegmentBreadcrumbs({
  table,
  segment,
}: SegmentBreadcrumbsProps) {
  const { data: schemas } = useListDatabaseSchemasQuery(
    table.db_id ? { id: table.db_id } : skipToken,
  );

  const showSchema = schemas && schemas.length > 1 && table.schema;

  return (
    <Group className={S.breadcrumbs} gap="sm" wrap="nowrap" px="lg" pt="md">
      {table.db && (
        <BreadcrumbLink to={Urls.dataStudioData({ databaseId: table.db_id })}>
          <Ellipsified>{table.db.name}</Ellipsified>
        </BreadcrumbLink>
      )}

      {showSchema && (
        <>
          <Separator />
          <BreadcrumbLink
            to={Urls.dataStudioData({
              databaseId: table.db_id,
              schemaName: table.schema,
            })}
          >
            <Ellipsified>{table.schema}</Ellipsified>
          </BreadcrumbLink>
        </>
      )}

      <Separator />
      <BreadcrumbLink
        to={Urls.dataStudioData({
          databaseId: table.db_id,
          schemaName: table.schema,
          tableId: table.id,
          tab: "segments",
        })}
      >
        <Ellipsified>{table.display_name}</Ellipsified>
      </BreadcrumbLink>

      <Separator />
      <BreadcrumbText>
        <Ellipsified>{segment?.name ?? t`New segment`}</Ellipsified>
      </BreadcrumbText>
    </Group>
  );
}

function BreadcrumbLink({
  to,
  children,
}: {
  to: string;
  children: React.ReactNode;
}) {
  return (
    <Link to={to} className={S.link}>
      <Flex align="center" gap="xs" wrap="nowrap">
        {children}
      </Flex>
    </Link>
  );
}

function BreadcrumbText({ children }: { children: React.ReactNode }) {
  return (
    <Flex align="center" gap="xs" wrap="nowrap" className={S.text}>
      {children}
    </Flex>
  );
}

function Separator() {
  return <span className={S.separator}>/</span>;
}
