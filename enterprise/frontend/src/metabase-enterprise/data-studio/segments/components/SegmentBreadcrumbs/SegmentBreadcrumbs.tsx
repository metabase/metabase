import { skipToken } from "@reduxjs/toolkit/query";
import { Link } from "react-router";
import { t } from "ttag";

import { useListDatabaseSchemasQuery } from "metabase/api";
import { Ellipsified } from "metabase/common/components/Ellipsified";
import * as Urls from "metabase/lib/urls";
import { DataStudioBreadcrumbs } from "metabase-enterprise/data-studio/common/components/DataStudioBreadcrumbs";
import { useCollectionPath } from "metabase-enterprise/data-studio/common/hooks/use-collection-path/useCollectionPath";
import type { Segment, Table } from "metabase-types/api";

type SegmentBreadcrumbsProps = {
  table: Table;
  segment?: Segment;
};

export function PublishedTableSegmentBreadcrumbs({
  table,
  segment,
}: SegmentBreadcrumbsProps) {
  const { path, isLoadingPath } = useCollectionPath({
    collectionId: table.collection_id,
  });

  return (
    <DataStudioBreadcrumbs loading={isLoadingPath}>
      {path?.map((collection, i) => (
        <Link
          key={collection.id}
          to={Urls.dataStudioLibrary({
            expandedIds: path.slice(1, i + 1).map((c) => c.id),
          })}
        >
          {collection.name}
        </Link>
      ))}
      <Link
        key={`table-${table.id}`}
        to={Urls.dataStudioTableSegments(table.id)}
      >
        {table.display_name}
      </Link>
      <span>{segment?.name ?? t`New segment`}</span>
    </DataStudioBreadcrumbs>
  );
}

export function DataModelSegmentBreadcrumbs({
  table,
  segment,
}: SegmentBreadcrumbsProps) {
  const { data: schemas, isLoading } = useListDatabaseSchemasQuery(
    table.db_id ? { id: table.db_id } : skipToken,
  );

  const showSchema = schemas && schemas.length > 1 && table.schema;

  return (
    <DataStudioBreadcrumbs loading={isLoading}>
      {table.db && (
        <Link to={Urls.dataStudioData({ databaseId: table.db_id })}>
          <Ellipsified>{table.db.name}</Ellipsified>
        </Link>
      )}

      {showSchema && (
        <Link
          to={Urls.dataStudioData({
            databaseId: table.db_id,
            schemaName: table.schema,
          })}
        >
          <Ellipsified>{table.schema}</Ellipsified>
        </Link>
      )}
      <Link
        to={Urls.dataStudioData({
          databaseId: table.db_id,
          schemaName: table.schema,
          tableId: table.id,
          tab: "segments",
        })}
      >
        <Ellipsified>{table.display_name}</Ellipsified>
      </Link>
      {segment?.name ?? t`New segment`}
    </DataStudioBreadcrumbs>
  );
}
