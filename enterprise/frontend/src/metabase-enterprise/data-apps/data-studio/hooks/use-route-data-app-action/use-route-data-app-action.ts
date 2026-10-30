import { t } from "ttag";

import { skipToken, useGetActionQuery } from "metabase/api";
import { useActionDatabases } from "metabase/data-studio/actions/hooks/use-action-databases";
import { useParams } from "metabase/router";
import * as Urls from "metabase/urls";
import { useGetDataAppQuery } from "metabase-enterprise/api";

export function useRouteDataAppAction() {
  const params = useParams<{ name: string; actionId: string }>();
  const name = params.name ?? "";
  const actionId = Urls.extractEntityId(params.actionId);
  const {
    data: app,
    isLoading: isLoadingApp,
    error: appError,
  } = useGetDataAppQuery(name);
  const {
    currentData,
    isFetching: isFetchingAction,
    error: actionFetchError,
  } = useGetActionQuery(actionId != null ? { id: actionId } : skipToken);
  const {
    databases,
    isLoading: isLoadingDatabases,
    error: databasesError,
  } = useActionDatabases();

  const action = currentData?.type === "query" ? currentData : undefined;
  const isLoadingAction = currentData === undefined && isFetchingAction;
  const isActionNotFound =
    !isLoadingAction && actionFetchError === undefined && action === undefined;
  const actionError = isActionNotFound
    ? t`Action not found.`
    : actionFetchError;

  return {
    app,
    action,
    databases,
    isLoading: isLoadingApp || isLoadingAction || isLoadingDatabases,
    error: appError ?? actionError ?? databasesError,
  };
}
