import { t } from "ttag";

import { skipToken } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Flex, Stack, Text } from "metabase/ui";
import { useListSessionsQuery } from "metabase-enterprise/api";
import type { AdminSession } from "metabase-types/api";

import { SessionDetails } from "./SessionDetails";
import { SidebarHeader } from "./SidebarHeader";
import type { SessionDetailSidebarProps } from "./types";

type SidebarBodyProps = {
  session: AdminSession | undefined;
  error: unknown;
  isLoaded: boolean;
};

const SidebarBody = ({ session, error, isLoaded }: SidebarBodyProps) => {
  if (session) {
    return <SessionDetails session={session} />;
  }
  if (error != null) {
    return <LoadingAndErrorWrapper error={error} />;
  }
  if (!isLoaded) {
    return <LoadingAndErrorWrapper loading />;
  }
  return <Text c="text-secondary">{t`This session is no longer active.`}</Text>;
};

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
      <Stack h="100%" p="xl" gap="xl" style={{ overflowY: "auto" }}>
        <SidebarHeader
          sessionId={sessionId}
          session={session}
          prevSessionId={prevSessionId}
          nextSessionId={nextSessionId}
          isRevoking={isRevoking}
          onNavigate={onNavigate}
          onRevokeSession={onRevokeSession}
          onRevokeUserSessions={onRevokeUserSessions}
          onClose={onClose}
        />
        <SidebarBody
          session={session}
          error={error}
          isLoaded={currentData !== undefined}
        />
      </Stack>
    </Flex>
  );
};
