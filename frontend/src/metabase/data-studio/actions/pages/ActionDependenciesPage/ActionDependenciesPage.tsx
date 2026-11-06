import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import { Center } from "metabase/ui";
import * as Urls from "metabase/urls";

import { ActionDependenciesContent } from "../../components/ActionDependenciesContent";
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
      <ActionDependenciesContent
        action={action}
        baseUrl={Urls.dataStudioActionDependencies(action.id)}
      />
    </PageContainer>
  );
}
