import { t } from "ttag";

import { Link } from "metabase/common/components/Link";
import { DataStudioBreadcrumbs } from "metabase/common/data-studio/components/DataStudioBreadcrumbs";
import {
  PaneHeader,
  PanelHeaderTitle,
} from "metabase/common/data-studio/components/PaneHeader";
import { useCollectionPath } from "metabase/common/data-studio/hooks/use-collection-path/useCollectionPath";
import * as Urls from "metabase/urls";
import type { Dashboard } from "metabase-types/api";

import { DashboardArchivedBanner } from "./DashboardArchivedBanner";
import { DashboardHeaderActions } from "./DashboardHeaderActions";
import { DashboardTabs } from "./DashboardTabs";
import { getDashboardFolders } from "./utils";

type DashboardHeaderProps = {
  dashboard: Dashboard;
};

export function DashboardHeader({ dashboard }: DashboardHeaderProps) {
  const { path, isLoadingPath } = useCollectionPath({
    collectionId: dashboard.collection_id,
  });
  const folders = getDashboardFolders(path ?? []);

  return (
    <>
      {dashboard.archived && <DashboardArchivedBanner dashboard={dashboard} />}
      <PaneHeader
        data-testid="dashboard-pane-header"
        title={<PanelHeaderTitle>{dashboard.name}</PanelHeaderTitle>}
        icon="dashboard"
        tabs={<DashboardTabs dashboardId={dashboard.id} />}
        actions={<DashboardHeaderActions dashboard={dashboard} />}
        breadcrumbs={
          <DataStudioBreadcrumbs loading={isLoadingPath}>
            <Link to={Urls.dataStudioDashboards()}>{t`Dashboards`}</Link>
            {folders.map((folder, index) => (
              <Link
                key={folder.id}
                to={Urls.dataStudioDashboards({
                  expandedIds: folders
                    .slice(0, index + 1)
                    .map((ancestor) => ancestor.id),
                })}
              >
                {folder.name}
              </Link>
            ))}
            <span>{dashboard.name}</span>
          </DataStudioBreadcrumbs>
        }
      />
    </>
  );
}
