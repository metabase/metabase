import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { Outlet } from "metabase/router";
import { Card, Center } from "metabase/ui";
import * as Urls from "metabase/urls";

import { ActionHeader } from "../../components/ActionHeader";
import { useRouteAction } from "../../hooks/use-route-action";

export function ActionDependenciesPage() {
  const { action, isLoading, error } = useRouteAction();

  if (isLoading || error != null || action == null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return (
    <PageContainer data-testid="action-dependencies">
      <ActionHeader action={action} />
      <PLUGIN_DEPENDENCIES.DependencyGraphPageContext.Provider
        value={{
          baseUrl: Urls.dataStudioActionDependencies(action.id),
          defaultEntry: { id: action.id, type: "action" },
        }}
      >
        <Card p={0} withBorder flex={1}>
          <Outlet />
        </Card>
      </PLUGIN_DEPENDENCIES.DependencyGraphPageContext.Provider>
    </PageContainer>
  );
}
