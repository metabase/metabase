import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { Outlet } from "metabase/router";
import { Card, Center } from "metabase/ui";
import * as Urls from "metabase/urls";

import { DashboardHeader } from "../../components/DashboardHeader";
import { useRouteDashboard } from "../../hooks/use-route-dashboard";

export function DashboardDependenciesPage() {
  const { dashboard, isLoading, error } = useRouteDashboard();

  if (isLoading || error != null || dashboard == null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return (
    <PageContainer>
      <DashboardHeader dashboard={dashboard} />
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
    </PageContainer>
  );
}
