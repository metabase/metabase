import { t } from "ttag";

import { skipToken, useGetActionQuery } from "metabase/api";
import { useParams } from "metabase/router";
import * as Urls from "metabase/urls";
import type { WritebackQueryAction } from "metabase-types/api";

type RouteActionResult = {
  action: WritebackQueryAction | undefined;
  isLoading: boolean;
  error: unknown;
};

export function useRouteAction(): RouteActionResult {
  const params = useParams<{ actionId: string }>();
  const actionId = Urls.extractEntityId(params.actionId);
  const { currentData, isFetching, error } = useGetActionQuery(
    actionId != null ? { id: actionId } : skipToken,
  );
  const action = currentData?.type === "query" ? currentData : undefined;
  const isLoading = currentData === undefined && isFetching;
  const isNotFound = !isLoading && error === undefined && action === undefined;

  return {
    action,
    isLoading,
    error: isNotFound ? t`Action not found.` : error,
  };
}
