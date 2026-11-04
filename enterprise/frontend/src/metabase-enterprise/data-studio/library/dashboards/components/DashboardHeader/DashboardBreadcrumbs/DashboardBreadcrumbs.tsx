import { t } from "ttag";

import { Link } from "metabase/common/components/Link";
import { DataStudioBreadcrumbs } from "metabase/common/data-studio/components/DataStudioBreadcrumbs";
import { useCollectionPath } from "metabase/common/data-studio/hooks/use-collection-path/useCollectionPath";
import * as Urls from "metabase/urls";
import type { CollectionId, Dashboard } from "metabase-types/api";

import { type DashboardLocation, getDashboardLocation } from "../utils";

type DashboardBreadcrumbsProps = {
  dashboard: Dashboard;
};

export function DashboardBreadcrumbs({ dashboard }: DashboardBreadcrumbsProps) {
  const { path, isLoadingPath } = useCollectionPath({
    collectionId: dashboard.collection_id,
  });
  const crumbs = getCrumbs(getDashboardLocation(path ?? []));

  return (
    <DataStudioBreadcrumbs loading={isLoadingPath}>
      {crumbs.map((crumb) => (
        <Link key={crumb.key} to={crumb.to}>
          {crumb.name}
        </Link>
      ))}
      <span>{dashboard.name}</span>
    </DataStudioBreadcrumbs>
  );
}

type Crumb = {
  key: CollectionId | "section";
  name: string;
  to: string;
};

function getCrumbs(location: DashboardLocation): Crumb[] {
  if (location.type === "collection") {
    return location.path.map((collection) => ({
      key: collection.id,
      name: collection.name,
      to: Urls.collection(collection),
    }));
  }

  return [
    { key: "section", name: t`Dashboards`, to: Urls.dataStudioDashboards() },
    ...location.folders.map((folder, index) => ({
      key: folder.id,
      name: folder.name,
      to: Urls.dataStudioDashboards({
        expandedIds: location.folders
          .slice(0, index + 1)
          .map((ancestor) => ancestor.id),
      }),
    })),
  ];
}
