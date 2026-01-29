import type { ReactNode } from "react";

import { skipToken } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import * as Urls from "metabase/lib/urls";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { Card, Center } from "metabase/ui";
import { useGetTransformQuery } from "metabase-enterprise/api";
import { PageContainer } from "metabase-enterprise/data-studio/common/components/PageContainer";
import { useTransformPermissions } from "metabase-enterprise/transforms/hooks/use-transform-permissions";

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
    isLoading: isLoadingTransform,
    error: transformError,
  } = useGetTransformQuery(id ?? skipToken);
  const { readOnly, isLoadingDatabases, databasesError } =
    useTransformPermissions({ transform });
  const isLoading = isLoadingTransform || isLoadingDatabases;
  const error = transformError || databasesError;

  if (id == null || transform == null || isLoading || error != null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return (
    <PageContainer data-testid="transforms-dependencies-content">
      <TransformHeader transform={transform} readOnly={readOnly} />
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
