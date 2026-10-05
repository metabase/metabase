import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { getUser } from "metabase/current-user";
import { useSelector } from "metabase/redux";
import { Flex, Stack, Text } from "metabase/ui";

import { SessionDetails } from "./SessionDetails";
import { SidebarFooter } from "./SidebarFooter";
import { SidebarHeader } from "./SidebarHeader";
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
    <Flex
      direction="column"
      h="100%"
      flex="1 1 auto"
      miw={0}
      style={{
        borderLeft: "1px solid var(--mb-color-border-neutral)",
      }}
      bg="background_page-primary"
      data-testid="session-detail-sidebar"
    >
      <Stack
        flex="1 1 auto"
        mih={0}
        p="xl"
        gap="xl"
        style={{ overflowY: "auto" }}
      >
        <SidebarHeader
          sessionId={sessionId}
          session={session}
          prevSessionId={prevSessionId}
          nextSessionId={nextSessionId}
          onNavigate={onNavigate}
          onClose={onClose}
        />
        <LoadingAndErrorWrapper loading={isLoading} error={error} noWrapper>
          {session ? (
            <SessionDetails session={session} />
          ) : (
            <Text c="text-secondary">{t`This session is no longer active.`}</Text>
          )}
        </LoadingAndErrorWrapper>
      </Stack>
      {session && (canRevokeSession || canRevokeUserSessions) && (
        <SidebarFooter
          session={session}
          isRevoking={isRevoking}
          canRevokeSession={canRevokeSession}
          canRevokeUserSessions={canRevokeUserSessions}
          onRevokeSession={onRevokeSession}
          onRevokeUserSessions={onRevokeUserSessions}
        />
      )}
    </Flex>
  );
};
