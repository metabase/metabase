import type { ReactNode } from "react";

import { skipToken, useGetSnippetQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import * as Urls from "metabase/lib/urls";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { Card, Center } from "metabase/ui";
import { PageContainer } from "metabase-enterprise/data-studio/common/components/PageContainer";

import { SnippetHeader } from "../../components/SnippetHeader";

export type SnippetDependenciesPageParams = {
  snippetId: string;
};

type SnippetDependenciesPageProps = {
  params?: SnippetDependenciesPageParams;
  children?: ReactNode;
};

export function SnippetDependenciesPage({
  params,
  children,
}: SnippetDependenciesPageProps) {
  const snippetId = Urls.extractEntityId(params?.snippetId);

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
          {children}
        </Card>
      </PLUGIN_DEPENDENCIES.DependencyGraphPageContext.Provider>
    </PageContainer>
  );
}
