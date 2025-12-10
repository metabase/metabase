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
import { Flex, Group, Text } from "metabase/ui";
import type { Measure, Table } from "metabase-types/api";

import S from "./MeasureBreadcrumbs.module.css";

type MeasureBreadcrumbsProps = {
  table: Table;
  measure?: Measure;
};

export function PublishedTableMeasureBreadcrumbs({
  table,
  measure,
}: MeasureBreadcrumbsProps) {
  const { data: collection } = useGetCollectionQuery(
    table.collection_id != null ? { id: table.collection_id } : skipToken,
  );

  const ancestors = collection ? getCollectionList({ collection }) : [];

  return (
    <Group c="text-secondary" gap="sm" wrap="nowrap" px="lg" pt="md">
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
      <BreadcrumbLink to={Urls.dataStudioTableMeasures(table.id)}>
        <Ellipsified>{table.display_name}</Ellipsified>
      </BreadcrumbLink>

      <Separator />
      <BreadcrumbText>
        <Ellipsified>{measure?.name ?? t`New measure`}</Ellipsified>
      </BreadcrumbText>
    </Group>
  );
}

export function DataModelMeasureBreadcrumbs({
  table,
  measure,
}: MeasureBreadcrumbsProps) {
  const { data: schemas } = useListDatabaseSchemasQuery(
    table.db_id ? { id: table.db_id } : skipToken,
  );

  const showSchema = schemas && schemas.length > 1 && table.schema;

  return (
    <Group c="text-secondary" gap="sm" wrap="nowrap" px="lg" pt="md">
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
          tab: "measures",
        })}
      >
        <Ellipsified>{table.display_name}</Ellipsified>
      </BreadcrumbLink>

      <Separator />
      <BreadcrumbText>
        <Ellipsified>{measure?.name ?? t`New measure`}</Ellipsified>
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
    <Flex align="center" gap="xs" wrap="nowrap">
      {children}
    </Flex>
  );
}

function Separator() {
  return <Text span>/</Text>;
}
