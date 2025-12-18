import type { ReactNode } from "react";

import { skipToken } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import * as Urls from "metabase/lib/urls";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { Card, Center } from "metabase/ui";
import { useGetTransformQuery } from "metabase-enterprise/api";
import { PageContainer } from "metabase-enterprise/data-studio/common/components/PageContainer";

import { TransformHeader } from "../../components/TransformHeader";

export type TransformDependenciesPageParams = {
  transformId: string;
};

type TransformDependenciesPageProps = {
  params?: TransformDependenciesPageParams;
  children?: ReactNode;
};

export function TransformDependenciesPage({
  params,
  children,
}: TransformDependenciesPageProps) {
  const id = Urls.extractEntityId(params?.transformId);
  const {
    data: transform,
    isLoading,
    error,
  } = useGetTransformQuery(id ?? skipToken);

  if (id == null || transform == null || isLoading || error != null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return (
    <PageContainer data-testid="transforms-dependencies-content">
      <TransformHeader transform={transform} />
      <PLUGIN_DEPENDENCIES.DependencyGraphPageContext.Provider
        value={{
          baseUrl: Urls.transformDependencies(transform.id),
          defaultEntry: { id: transform.id, type: "transform" },
        }}
      >
        <Card flex={1} p={0} withBorder>
          {children}
        </Card>
      </PLUGIN_DEPENDENCIES.DependencyGraphPageContext.Provider>
    </PageContainer>
  );
}
