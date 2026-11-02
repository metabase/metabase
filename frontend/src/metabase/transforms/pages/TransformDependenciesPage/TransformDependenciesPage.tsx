import { skipToken, useGetTransformQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { Outlet, useParams } from "metabase/router";
import { useTransformPermissions } from "metabase/transforms/hooks/use-transform-permissions";
import { Card, Center, Skeleton } from "metabase/ui";
import * as Urls from "metabase/urls";

import { TransformDisconnectedDatabaseBanner } from "../../components/TransformDisconnectedDatabaseBanner";
import { TransformHeader } from "../../components/TransformHeader";
import { TransformPageSkeleton } from "../../components/TransformSkeletons";

export type TransformDependenciesPageParams = {
  transformId: string;
};

export function TransformDependenciesPage() {
  const params = useParams<TransformDependenciesPageParams>();
  const id = Urls.extractEntityId(params.transformId);
  const {
    data: transform,
    isLoading: isLoadingTransform,
    error: transformError,
  } = useGetTransformQuery(id ?? skipToken);
  const { readOnly, isLoadingDatabases, databasesError } =
    useTransformPermissions({ transform });
  const isLoading = isLoadingTransform || isLoadingDatabases;
  const error = transformError || databasesError;

  if (isLoading) {
    return (
      <TransformPageSkeleton>
        <Skeleton flex={1} radius="md" />
      </TransformPageSkeleton>
    );
  }

  if (id == null || transform == null || error != null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper error={error} />
      </Center>
    );
  }

  return (
    <PageContainer data-testid="transforms-dependencies-content">
      <TransformHeader transform={transform} readOnly={readOnly} />
      <TransformDisconnectedDatabaseBanner transform={transform} />
      <PLUGIN_DEPENDENCIES.DependencyGraphPageContext.Provider
        value={{
          baseUrl: Urls.transformDependencies(transform.id),
          defaultEntry: { id: transform.id, type: "transform" },
        }}
      >
        <Card flex={1} p={0} withBorder>
          <Outlet />
        </Card>
      </PLUGIN_DEPENDENCIES.DependencyGraphPageContext.Provider>
    </PageContainer>
  );
}
