import { skipToken } from "metabase/api";
import { isResourceNotFoundError } from "metabase/utils/errors";
import { useGetOAuthClientQuery } from "metabase-enterprise/api";
import type { OAuthClient, OAuthClientId } from "metabase-types/api";

/**
 * The client the sidebar is open on. Always fetched, whether or not the list handed over a row: the scopes, the
 * contacts and the users are the detail's own, and the detail also beats the row, which is a snapshot the server
 * may since have contradicted.
 *
 * A 404 is an answer rather than a failure — the id in the URL names no registered client — so it clears both the
 * client and the error, leaving the caller to say the client is gone.
 */
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
