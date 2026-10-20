import { skipToken } from "metabase/api";
import { isResourceNotFoundError } from "metabase/utils/errors";
import { useGetOAuthClientQuery } from "metabase-enterprise/api";
import type { OAuthClient, OAuthClientId } from "metabase-types/api";

// Always fetched, since the detail supersedes a stale row. A 404 means "no such client", not an error.
export function useShownClient(
  clientId: OAuthClientId | undefined,
  clientFromPage: OAuthClient | undefined,
) {
  const { currentData: detail, error } = useGetOAuthClientQuery(
    clientId ?? skipToken,
  );
  const isUnknownClient = isResourceNotFoundError(error);
  const client = isUnknownClient ? undefined : (detail ?? clientFromPage);

  return {
    client,
    detail: isUnknownClient ? undefined : detail,
    isLoading: client === undefined && !isUnknownClient && error === undefined,
    error: isUnknownClient ? undefined : error,
  };
}
