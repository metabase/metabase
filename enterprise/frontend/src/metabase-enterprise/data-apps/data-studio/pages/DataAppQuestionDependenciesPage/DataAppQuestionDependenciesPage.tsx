import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { Outlet } from "metabase/router";
import { Card, Center } from "metabase/ui";
import * as Urls from "metabase/urls";

import { DataAppQuestionHeader } from "../../components/DataAppQuestionHeader";
import { useRouteDataAppQuestion } from "../../hooks/use-route-data-app-question";

export function DataAppQuestionDependenciesPage() {
  const { app, card, isLoading, error } = useRouteDataAppQuestion();

  if (isLoading || error != null || app == null || card == null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return (
    <PageContainer data-testid="data-app-question-dependencies">
      <DataAppQuestionHeader app={app} card={card} />
      <PLUGIN_DEPENDENCIES.DependencyGraphPageContext.Provider
        value={{
          baseUrl: Urls.dataStudioDataAppQuestionDependencies(
            app.name,
            card.id,
          ),
          defaultEntry: { id: card.id, type: "card" },
        }}
      >
        <Card p={0} withBorder flex={1}>
          <Outlet />
        </Card>
      </PLUGIN_DEPENDENCIES.DependencyGraphPageContext.Provider>
    </PageContainer>
  );
}
