import { t } from "ttag";

import { Button, Group } from "metabase/ui";

import S from "./SessionDetailSidebar.module.css";
import type { SidebarFooterProps } from "./types";

export const SidebarFooter = ({
  session,
  isRevoking,
  canRevokeSession,
  canRevokeUserSessions,
  onRevokeSession,
  onRevokeUserSessions,
}: SidebarFooterProps) => (
  <Group className={S.footer} gap="sm" grow>
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
  </Group>
);
