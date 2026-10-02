import { t } from "ttag";

import { SidebarFooter as DetailSidebarFooter } from "metabase/monitor/components/DetailSidebar";
import { Button } from "metabase/ui";

import type { SidebarFooterProps } from "./types";

export const SidebarFooter = ({
  session,
  isRevoking,
  canRevokeSession,
  canRevokeUserSessions,
  onRevokeSession,
  onRevokeUserSessions,
}: SidebarFooterProps) => (
  <DetailSidebarFooter>
    {canRevokeSession && (
      <Button disabled={isRevoking} onClick={() => onRevokeSession(session)}>
        {t`Revoke session`}
      </Button>
    )}
    {canRevokeUserSessions && (
      <Button
        disabled={isRevoking}
        onClick={() => onRevokeUserSessions(session)}
      >
        {t`Revoke active sessions`}
      </Button>
    )}
  </DetailSidebarFooter>
);
