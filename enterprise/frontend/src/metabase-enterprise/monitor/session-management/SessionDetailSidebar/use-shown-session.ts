import { skipToken } from "metabase/api";
import { useListSessionsQuery } from "metabase-enterprise/api";
import type { Session, SessionId } from "metabase-types/api";

export function useShownSession(
  sessionId: SessionId | undefined,
  sessionFromPage: Session | undefined,
) {
  // There is no fetch-by-id endpoint, so a session that isn't on the current page is looked up with the ids filter
  const { currentData, error } = useListSessionsQuery(
    sessionId === undefined || sessionFromPage
      ? skipToken
      : { ids: [sessionId] },
  );
  const session = sessionFromPage ?? currentData?.data[0];

  return {
    session,
    isLoading: session === undefined && currentData === undefined,
    error,
  };
}
