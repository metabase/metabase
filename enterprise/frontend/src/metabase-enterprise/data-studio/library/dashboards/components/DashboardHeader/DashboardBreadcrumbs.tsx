import { t } from "ttag";

import { Link } from "metabase/common/components/Link";
import { DataStudioBreadcrumbs } from "metabase/common/data-studio/components/DataStudioBreadcrumbs";
import { useCollectionPath } from "metabase/common/data-studio/hooks/use-collection-path/useCollectionPath";
import * as Urls from "metabase/urls";
import type { Dashboard } from "metabase-types/api";

import { getDashboardLocation } from "./utils";

type DashboardBreadcrumbsProps = {
  dashboard: Dashboard;
};

export function DashboardBreadcrumbs({ dashboard }: DashboardBreadcrumbsProps) {
  const { path, isLoadingPath } = useCollectionPath({
    collectionId: dashboard.collection_id,
  });
  const location = getDashboardLocation(path ?? []);
  const collections =
    location.type === "library" ? location.folders : location.path;

  return (
    <DataStudioBreadcrumbs loading={isLoadingPath}>
      {location.type === "library" && (
        <Link to={Urls.dataStudioDashboards()}>{t`Dashboards`}</Link>
      )}
      {collections.map((collection, index) => (
        <Link
          key={collection.id}
          to={Urls.dataStudioDashboards({
            expandedIds: collections
              .slice(0, index + 1)
              .map((ancestor) => ancestor.id),
          })}
        >
          {collection.name}
        </Link>
      ))}
      <span>{dashboard.name}</span>
    </DataStudioBreadcrumbs>
  );
}
