import { t } from "ttag";

import { skipToken } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { getUser } from "metabase/current-user";
import { DetailSidebarShell } from "metabase/monitor/components/DetailSidebar";
import { useSelector } from "metabase/redux";
import { Text } from "metabase/ui";
import { useListSessionsQuery } from "metabase-enterprise/api";

import { SessionDetails } from "./SessionDetails";
import { SidebarFooter } from "./SidebarFooter";
import { SidebarHeader } from "./SidebarHeader";
import type { SessionDetailSidebarProps } from "./types";

export const SessionDetailSidebar = ({
  sessionId,
  sessionFromPage,
  prevSessionId,
  nextSessionId,
  isRevoking,
  onNavigate,
  onRevokeSession,
  onRevokeUserSessions,
  onClose,
}: SessionDetailSidebarProps) => {
  // There is no fetch-by-id endpoint, so a session that isn't on the current page is looked up with the ids filter
  const { currentData, error } = useListSessionsQuery(
    sessionFromPage ? skipToken : { ids: [sessionId] },
  );
  const session = sessionFromPage ?? currentData?.data[0];
  const currentUser = useSelector(getUser);

  const canRevokeSession =
    session !== undefined && !session.current && session.status === "live";
  const canRevokeUserSessions =
    session !== undefined && session.user.id !== currentUser?.id;

  return (
    <DetailSidebarShell
      data-testid="session-detail-sidebar"
      footer={
        session &&
        (canRevokeSession || canRevokeUserSessions) && (
          <SidebarFooter
            session={session}
            isRevoking={isRevoking}
            canRevokeSession={canRevokeSession}
            canRevokeUserSessions={canRevokeUserSessions}
            onRevokeSession={onRevokeSession}
            onRevokeUserSessions={onRevokeUserSessions}
          />
        )
      }
    >
      <SidebarHeader
        sessionId={sessionId}
        session={session}
        prevSessionId={prevSessionId}
        nextSessionId={nextSessionId}
        onNavigate={onNavigate}
        onClose={onClose}
      />
      <LoadingAndErrorWrapper
        loading={session === undefined && currentData === undefined}
        error={error}
        noWrapper
      >
        {session ? (
          <SessionDetails session={session} />
        ) : (
          <Text c="text-secondary">{t`This session is no longer active.`}</Text>
        )}
      </LoadingAndErrorWrapper>
    </DetailSidebarShell>
  );
};
