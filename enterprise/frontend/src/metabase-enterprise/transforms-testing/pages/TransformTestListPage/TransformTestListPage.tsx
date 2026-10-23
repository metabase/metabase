import { skipToken, useGetTransformQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import { useParams } from "metabase/router";
import { TransformHeader } from "metabase/transforms/components/TransformHeader";
import { useTransformPermissions } from "metabase/transforms/hooks/use-transform-permissions";
import { Center } from "metabase/ui";
import * as Urls from "metabase/urls";
import { useListTransformTestsQuery } from "metabase-enterprise/api";

import { TransformTestList } from "./TransformTestList";

type TransformTestListPageParams = {
  transformId: string;
};

export function TransformTestListPage() {
  const params = useParams<TransformTestListPageParams>();
  const transformId = Urls.extractEntityId(params.transformId);
  const {
    data: transform,
    isLoading: isLoadingTransform,
    error: transformError,
  } = useGetTransformQuery(transformId ?? skipToken);
  const {
    data: tests = [],
    isLoading: isLoadingTests,
    error: testsError,
  } = useListTransformTestsQuery(
    transformId != null ? { "transform-id": transformId } : skipToken,
  );
  const { readOnly, isLoadingDatabases, databasesError } =
    useTransformPermissions({ transform });
  const isLoading = isLoadingTransform || isLoadingTests || isLoadingDatabases;
  const error = transformError ?? testsError ?? databasesError;

  if (transform == null || isLoading || error != null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return (
    <PageContainer data-testid="transform-test-list">
      <TransformHeader transform={transform} readOnly={readOnly} />
      <TransformTestList tests={tests} readOnly={readOnly ?? false} />
    </PageContainer>
  );
}
