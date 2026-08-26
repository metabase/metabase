import { skipToken, useGetSnippetQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { Outlet, useParams } from "metabase/router";
import { Card, Center } from "metabase/ui";
import * as Urls from "metabase/urls";

import { SnippetHeader } from "../../components/SnippetHeader";

export type SnippetDependenciesPageParams = {
  snippetId: string;
};

export function SnippetDependenciesPage() {
  const params = useParams<SnippetDependenciesPageParams>();
  const snippetId = Urls.extractEntityId(params.snippetId);

  const {
    data: snippet,
    isLoading,
    error,
  } = useGetSnippetQuery(snippetId ?? skipToken);

  if (snippetId == null || snippet == null || isLoading || error != null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return (
    <PageContainer>
      <SnippetHeader snippet={snippet} />
      <PLUGIN_DEPENDENCIES.DependencyGraphPageContext.Provider
        value={{
          baseUrl: Urls.dataStudioSnippetDependencies(snippet.id),
          defaultEntry: { id: snippet.id, type: "snippet" },
        }}
      >
        <Card p={0} withBorder flex={1}>
          <Outlet />
        </Card>
      </PLUGIN_DEPENDENCIES.DependencyGraphPageContext.Provider>
    </PageContainer>
  );
}
