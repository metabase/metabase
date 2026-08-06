import { Link } from "metabase/common/components/Link";
import { DataStudioBreadcrumbs } from "metabase/common/data-studio/components/DataStudioBreadcrumbs/DataStudioBreadcrumbs";
import { useCollectionPath } from "metabase/common/data-studio/hooks/use-collection-path/useCollectionPath";
import { useWorktreeId } from "metabase/common/worktrees";
import * as Urls from "metabase/urls";
import type { Card } from "metabase-types/api";

interface DataStudioMetricBreadcrumbsProps {
  card: Card;
}

export function DataStudioMetricBreadcrumbs({
  card,
}: DataStudioMetricBreadcrumbsProps) {
  const worktreeId = useWorktreeId();
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
            worktreeId,
          })}
        >
          {collection.name}
        </Link>
      ))}
      <span>{card.name}</span>
    </DataStudioBreadcrumbs>
  );
}
