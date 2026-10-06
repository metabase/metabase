import { skipToken } from "metabase/api";
import { useListSessionsQuery } from "metabase-enterprise/api";
import type { Session, SessionId } from "metabase-types/api";

export function useShownSession(
  sessionId: SessionId | undefined,
  sessionFromPage: Session | undefined,
) {
  const { currentData, error } = useListSessionsQuery(
    sessionId === undefined ? skipToken : { ids: [sessionId], status: "all" },
  );
  const session = sessionFromPage ?? currentData?.data[0];

  return {
    session,
    isLoading: session === undefined && currentData === undefined,
    error: session === undefined ? error : undefined,
  };
}
