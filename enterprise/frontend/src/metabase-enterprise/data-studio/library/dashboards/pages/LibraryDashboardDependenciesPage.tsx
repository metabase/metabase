import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { Outlet } from "metabase/router";
import { Card } from "metabase/ui";
import * as Urls from "metabase/urls";

import { LibraryDashboardPage } from "../components/LibraryDashboardPage";

export function LibraryDashboardDependenciesPage() {
  return (
    <LibraryDashboardPage data-testid="library-dashboard-dependencies-page">
      {(dashboard) => (
        <PLUGIN_DEPENDENCIES.DependencyGraphPageContext.Provider
          value={{
            baseUrl: Urls.dataStudioLibraryDashboardDependencies(dashboard.id),
            defaultEntry: { id: dashboard.id, type: "dashboard" },
          }}
        >
          <Card p={0} withBorder flex={1}>
            <Outlet />
          </Card>
        </PLUGIN_DEPENDENCIES.DependencyGraphPageContext.Provider>
      )}
    </LibraryDashboardPage>
  );
}
