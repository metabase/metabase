import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import { ActionDefinitionContent } from "metabase/data-studio/actions/components/ActionDefinitionContent";
import { Center } from "metabase/ui";

import { DataAppActionHeader } from "../../components/DataAppActionHeader";
import { useRouteDataAppAction } from "../../hooks/use-route-data-app-action";

export function DataAppActionDefinitionPage() {
  const { app, action, databases, isLoading, error } = useRouteDataAppAction();

  if (isLoading || error != null || app == null || action == null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return (
    <PageContainer data-testid="data-app-action-definition">
      <DataAppActionHeader app={app} action={action} />
      <ActionDefinitionContent action={action} databases={databases} />
    </PageContainer>
  );
}
