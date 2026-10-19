import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { getUser } from "metabase/current-user";
import {
  DetailSidebarHeader,
  DetailSidebarShell,
  DetailSidebarTitle,
} from "metabase/monitor/components/DetailSidebar";
import { useSelector } from "metabase/redux";
import { Text } from "metabase/ui";
import * as Urls from "metabase/urls";

import { getSessionUserName } from "../utils";

import { SessionDetails } from "./SessionDetails";
import { SidebarFooter } from "./SidebarFooter";
import type { SessionDetailSidebarProps } from "./types";
import { useShownSession } from "./use-shown-session";

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
  const { session, isLoading, error } = useShownSession(
    sessionId,
    sessionFromPage,
  );
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
      <DetailSidebarHeader
        prevId={prevSessionId}
        nextId={nextSessionId}
        previousLabel={t`Previous session`}
        nextLabel={t`Next session`}
        detailPath={Urls.monitorSessionDetail(sessionId)}
        onNavigate={onNavigate}
        onClose={onClose}
      />
      <LoadingAndErrorWrapper loading={isLoading} error={error} noWrapper>
        {session ? (
          <>
            <DetailSidebarTitle
              typeLabel={t`Session`}
              title={getSessionUserName(session.user)}
            />
            <SessionDetails session={session} />
          </>
        ) : (
          <Text c="text-secondary">{t`This session is no longer active.`}</Text>
        )}
      </LoadingAndErrorWrapper>
    </DetailSidebarShell>
  );
};
