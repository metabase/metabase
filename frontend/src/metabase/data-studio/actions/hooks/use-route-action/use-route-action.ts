import { t } from "ttag";

import { skipToken, useGetActionQuery } from "metabase/api";
import { useParams } from "metabase/router";
import * as Urls from "metabase/urls";
import type { WritebackAction } from "metabase-types/api";

type RouteActionResult = {
  action: WritebackAction | undefined;
  isLoading: boolean;
  error: unknown;
};

export function useRouteAction(): RouteActionResult {
  const params = useParams<{ actionId: string }>();
  const actionId = Urls.extractEntityId(params.actionId);
  const {
    currentData: action,
    isFetching,
    error,
  } = useGetActionQuery(actionId != null ? { id: actionId } : skipToken);
  const isLoading = action === undefined && isFetching;
  const isNotFound = !isLoading && error === undefined && action === undefined;

  return {
    action,
    isLoading,
    error: isNotFound ? t`Action not found.` : error,
  };
}
