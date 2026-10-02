import { useCallback } from "react";
import { msgid, ngettext, t } from "ttag";

import { useRevocation } from "metabase/monitor/hooks";
import { useRevokeSessionsMutation } from "metabase-enterprise/api";
import type { RevokeSessionsRequest, Session } from "metabase-types/api";

import { getSessionUserName } from "../utils";

type UseSessionRevocationOptions = {
  onRevoked: (request: RevokeSessionsRequest) => void;
};

export function useSessionRevocation({
  onRevoked,
}: UseSessionRevocationOptions) {
  const [revokeSessions, { isLoading: isRevoking }] =
    useRevokeSessionsMutation();

  const { confirmModal, confirmRevoke } = useRevocation<RevokeSessionsRequest>({
    revoke: revokeSessions,
    messages: {
      revoked: (count) =>
        ngettext(
          msgid`Revoked ${count} session`,
          `Revoked ${count} sessions`,
          count,
        ),
      raced: (count) =>
        ngettext(
          msgid`${count} new session started while revoking`,
          `${count} new sessions started while revoking`,
          count,
        ),
      failed: t`Could not revoke sessions.`,
    },
    onRevoked,
  });

  const revokeSelected = useCallback(
    (sessions: Session[]) => {
      const count = sessions.length;
      confirmRevoke({
        title: ngettext(
          msgid`Revoke ${count} session?`,
          `Revoke ${count} sessions?`,
          count,
        ),
        message: t`Anyone using them will be signed out and need to sign in again.`,
        request: { ids: sessions.map((session) => session.id) },
      });
    },
    [confirmRevoke],
  );

  const revokeSession = useCallback(
    (session: Session) => {
      const name = getSessionUserName(session.user);
      confirmRevoke({
        title: t`Revoke this session?`,
        message: t`${name} will be signed out of this session and need to sign in again.`,
        request: { ids: [session.id] },
      });
    },
    [confirmRevoke],
  );

  const revokeUserSessions = useCallback(
    (session: Session) => {
      const name = getSessionUserName(session.user);
      confirmRevoke({
        title: t`Revoke all sessions for ${name}?`,
        message: t`${name} will be signed out everywhere. Your own current session is never revoked.`,
        request: { "user-id": session.user.id },
      });
    },
    [confirmRevoke],
  );

  const revokeAll = useCallback(() => {
    confirmRevoke({
      title: t`Revoke all sessions?`,
      message: t`Everyone will be signed out and need to sign in again, except you in this session.`,
      request: {},
    });
  }, [confirmRevoke]);

  return {
    isRevoking,
    confirmModal,
    revokeSelected,
    revokeSession,
    revokeUserSessions,
    revokeAll,
  };
}
