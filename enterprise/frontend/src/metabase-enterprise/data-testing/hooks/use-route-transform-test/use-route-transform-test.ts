import { skipToken, useGetTransformQuery } from "metabase/api";
import { useParams } from "metabase/router";
import { useTransformPermissions } from "metabase/transforms/hooks/use-transform-permissions";
import * as Urls from "metabase/urls";
import { useGetTransformTestQuery } from "metabase-enterprise/api";

type TransformTestRouteParams = {
  transformId: string;
  testId: string;
};

export function useRouteTransformTest() {
  const params = useParams<TransformTestRouteParams>();
  const transformId = Urls.extractEntityId(params.transformId);
  const testId = Urls.extractEntityId(params.testId);
  const {
    data: transform,
    isLoading: isLoadingTransform,
    error: transformError,
  } = useGetTransformQuery(transformId ?? skipToken);
  const {
    data: test,
    isLoading: isLoadingTest,
    error: testError,
  } = useGetTransformTestQuery(testId ?? skipToken);
  const { readOnly, isLoadingDatabases, databasesError } =
    useTransformPermissions({ transform });

  return {
    transform,
    test,
    readOnly: readOnly ?? false,
    isLoading: isLoadingTransform || isLoadingTest || isLoadingDatabases,
    error: transformError ?? testError ?? databasesError,
  };
}
