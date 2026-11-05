import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import { ActionDependenciesContent } from "metabase/data-studio/actions/components/ActionDependenciesContent";
import { Center } from "metabase/ui";
import * as Urls from "metabase/urls";

import { DataAppActionHeader } from "../../components/DataAppActionHeader";
import { useRouteDataAppAction } from "../../hooks/use-route-data-app-action";

export function DataAppActionDependenciesPage() {
  const { app, action, isLoading, error } = useRouteDataAppAction();

  if (isLoading || error != null || app == null || action == null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return (
    <PageContainer data-testid="data-app-action-dependencies">
      <DataAppActionHeader app={app} action={action} />
      <ActionDependenciesContent
        action={action}
        baseUrl={Urls.dataStudioDataAppActionDependencies(app.name, action.id)}
      />
    </PageContainer>
  );
}
