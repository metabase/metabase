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
  const { data, isLoading, error } = useGetActionQuery(
    actionId != null ? { id: actionId } : skipToken,
  );
  return {
    action: data?.type === "query" ? data : undefined,
    isLoading,
    error,
  };
}
