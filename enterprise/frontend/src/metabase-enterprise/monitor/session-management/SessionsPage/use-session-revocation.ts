import { useCallback } from "react";
import { msgid, ngettext, t } from "ttag";

import { useConfirmation } from "metabase/common/hooks/use-confirmation";
import { useDispatch } from "metabase/redux";
import { addUndo } from "metabase/redux/undo";
import { useRevokeSessionsMutation } from "metabase-enterprise/api";
import type {
  AdminSession,
  RevokeAdminSessionsRequest,
} from "metabase-types/api";

import { getSessionUserName } from "../utils";

type RevokeConfirmation = {
  title: string;
  message: string;
  request: RevokeAdminSessionsRequest;
};

type UseSessionRevocationOptions = {
  onRevoked: (request: RevokeAdminSessionsRequest) => void;
};

export function useSessionRevocation({
  onRevoked,
}: UseSessionRevocationOptions) {
  const dispatch = useDispatch();
  const [revokeSessions, { isLoading: isRevoking }] =
    useRevokeSessionsMutation();
  const { modalContent: confirmModal, show: showConfirm } = useConfirmation();

  const revoke = useCallback(
    async (request: RevokeAdminSessionsRequest) => {
      try {
        const { revoked, remaining } = await revokeSessions(request).unwrap();
        dispatch(
          addUndo({
            message: ngettext(
              msgid`Revoked ${revoked} session`,
              `Revoked ${revoked} sessions`,
              revoked,
            ),
          }),
        );
        if (remaining > 0) {
          dispatch(
            addUndo({
              icon: "warning",
              message: ngettext(
                msgid`${remaining} new session started while revoking`,
                `${remaining} new sessions started while revoking`,
                remaining,
              ),
            }),
          );
        }
        onRevoked(request);
      } catch {
        dispatch(
          addUndo({ icon: "warning", message: t`Could not revoke sessions.` }),
        );
      }
    },
    [dispatch, onRevoked, revokeSessions],
  );

  const confirmRevoke = useCallback(
    ({ title, message, request }: RevokeConfirmation) => {
      showConfirm({
        title,
        message,
        confirmButtonText: t`Revoke`,
        confirmButtonProps: { color: "feedback-negative" },
        onConfirm: () => revoke(request),
      });
    },
    [revoke, showConfirm],
  );

  const revokeSelected = useCallback(
    (sessions: AdminSession[]) => {
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
    (session: AdminSession) => {
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
    (session: AdminSession) => {
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
