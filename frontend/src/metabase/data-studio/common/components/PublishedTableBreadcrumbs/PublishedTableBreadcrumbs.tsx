import type { ReactNode } from "react";

import { Link } from "metabase/common/components/Link";
import { DataStudioBreadcrumbs } from "metabase/common/data-studio/components/DataStudioBreadcrumbs";
import { useCollectionPath } from "metabase/common/data-studio/hooks/use-collection-path/useCollectionPath";
import { getLibraryCollectionDisplayName } from "metabase/data-studio/common/utils";
import * as Urls from "metabase/urls";
import type { Table } from "metabase-types/api";

type PublishedTableBreadcrumbsProps = {
  table: Table;
  entityName: string | undefined;
  newEntityLabel: string;
  tableListUrl: string;
  entityUrl?: string;
  entityChildName?: string;
  children?: ReactNode;
};

export function PublishedTableBreadcrumbs({
  table,
  entityName,
  newEntityLabel,
  tableListUrl,
  entityUrl,
  entityChildName,
  children,
}: PublishedTableBreadcrumbsProps) {
  const { path, isLoadingPath } = useCollectionPath({
    collectionId: table.collection?.id ?? null,
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
          {getLibraryCollectionDisplayName(collection)}
        </Link>
      ))}
      <Link to={tableListUrl}>{table.display_name}</Link>
      {entityUrl != null ? (
        <Link to={entityUrl}>{entityName ?? newEntityLabel}</Link>
      ) : (
        <span>{entityName ?? newEntityLabel}</span>
      )}
      {children || (entityChildName != null && <span>{entityChildName}</span>)}
    </DataStudioBreadcrumbs>
  );
}
