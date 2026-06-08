import { Link } from "metabase/common/components/Link";
import { DataStudioBreadcrumbs } from "metabase/data-studio/common/components/DataStudioBreadcrumbs/DataStudioBreadcrumbs";
import { useCollectionPath } from "metabase/data-studio/common/hooks/use-collection-path/useCollectionPath";
import * as Urls from "metabase/urls";
import type { Card } from "metabase-types/api";

interface DataStudioMetricBreadcrumbsProps {
  card: Card;
}

export function DataStudioMetricBreadcrumbs({
  card,
}: DataStudioMetricBreadcrumbsProps) {
  const { path, isLoadingPath } = useCollectionPath({
    collectionId: card.collection_id,
  });

  return (
    <DataStudioBreadcrumbs loading={isLoadingPath}>
      {path?.map((collection, index) => (
        <Link
          key={collection.id}
          to={Urls.dataStudioLibrary({
            expandedIds: path.slice(1, index + 1).map((c) => c.id),
          })}
        >
          {collection.name}
        </Link>
      ))}
      <span>{card.name}</span>
    </DataStudioBreadcrumbs>
  );
}
