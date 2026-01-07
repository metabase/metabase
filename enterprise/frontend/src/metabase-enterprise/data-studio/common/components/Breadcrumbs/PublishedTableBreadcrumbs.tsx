import { Link } from "react-router";

import * as Urls from "metabase/lib/urls";
import { DataStudioBreadcrumbs } from "metabase-enterprise/data-studio/common/components/DataStudioBreadcrumbs";
import { useCollectionPath } from "metabase-enterprise/data-studio/common/hooks/use-collection-path/useCollectionPath";
import type { Table } from "metabase-types/api";

type PublishedTableBreadcrumbsProps = {
  table: Table;
  entityName: string | undefined;
  newEntityLabel: string;
  tableListUrl: string;
};

export function PublishedTableBreadcrumbs({
  table,
  entityName,
  newEntityLabel,
  tableListUrl,
}: PublishedTableBreadcrumbsProps) {
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
      <Link to={tableListUrl}>{table.display_name}</Link>
      <span>{entityName ?? newEntityLabel}</span>
    </DataStudioBreadcrumbs>
  );
}
