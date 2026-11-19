import { t } from "ttag";

import { skipToken, useGetActionQuery } from "metabase/api";
import { useParams } from "metabase/router";
import * as Urls from "metabase/urls";
import { useGetActionTestQuery } from "metabase-enterprise/api";

type ActionTestRouteParams = {
  actionId: string;
  testId: string;
};

export function useRouteActionTest() {
  const params = useParams<ActionTestRouteParams>();
  const actionId = Urls.extractEntityId(params.actionId);
  const testId = Urls.extractEntityId(params.testId);
  const {
    data: action,
    isLoading: isLoadingAction,
    error: actionError,
  } = useGetActionQuery(actionId != null ? { id: actionId } : skipToken);
  const {
    data: test,
    isLoading: isLoadingTest,
    error: testError,
  } = useGetActionTestQuery(testId ?? skipToken);

  const isLoading = isLoadingAction || isLoadingTest;
  const isMissing =
    actionId == null ||
    testId == null ||
    (test != null && test.action_id !== actionId);
  const notFoundError = !isLoading && isMissing ? t`Not found.` : undefined;

  return {
    action,
    test: isMissing ? undefined : test,
    isLoading,
    error: actionError ?? testError ?? notFoundError,
  };
}
