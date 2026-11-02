import { skipToken, useGetSnippetQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import { PageCardSkeleton } from "metabase/common/data-studio/components/PageSkeleton";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { Outlet, useParams } from "metabase/router";
import { Card, Center } from "metabase/ui";
import * as Urls from "metabase/urls";

import { SnippetHeader } from "../../components/SnippetHeader";
import { SnippetPageSkeleton } from "../../components/SnippetPageSkeleton";

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

  if (isLoading) {
    return (
      <SnippetPageSkeleton>
        <PageCardSkeleton />
      </SnippetPageSkeleton>
    );
  }

  if (snippetId == null || snippet == null || error != null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper error={error} />
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
