import { t } from "ttag";

import { Button, Stack } from "metabase/ui";

import { getSessionUserName } from "../utils";

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
  <Stack className={S.footer} gap="sm">
    {canRevokeSession && (
      <Button
        fullWidth
        variant="filled"
        color="feedback-negative"
        disabled={isRevoking}
        onClick={() => onRevokeSession(session)}
      >
        {t`Revoke session`}
      </Button>
    )}
    {canRevokeUserSessions && (
      <Button
        fullWidth
        variant="filled"
        color="feedback-negative"
        disabled={isRevoking}
        onClick={() => onRevokeUserSessions(session)}
      >
        {t`Revoke all sessions for ${getSessionUserName(session.user)}`}
      </Button>
    )}
  </Stack>
);
