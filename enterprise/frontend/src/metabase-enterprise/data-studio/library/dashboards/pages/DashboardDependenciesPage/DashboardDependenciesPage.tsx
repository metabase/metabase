import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { Outlet } from "metabase/router";
import { Card } from "metabase/ui";
import * as Urls from "metabase/urls";

import { DashboardPageShell } from "../../components/DashboardPageShell";

export function DashboardDependenciesPage() {
  return (
    <DashboardPageShell>
      {(dashboard) => (
        <PLUGIN_DEPENDENCIES.DependencyGraphPageContext.Provider
          value={{
            baseUrl: Urls.dataStudioDashboardDependencies(dashboard.id),
            defaultEntry: { id: dashboard.id, type: "dashboard" },
          }}
        >
          <Card p={0} withBorder flex={1}>
            <Outlet />
          </Card>
        </PLUGIN_DEPENDENCIES.DependencyGraphPageContext.Provider>
      )}
    </DashboardPageShell>
  );
}
