import { useCallback } from "react";
import { msgid, ngettext, t } from "ttag";

import { useRevocation } from "metabase/monitor/hooks";
import { useRevokeOAuthClientsMutation } from "metabase-enterprise/api";
import type {
  OAuthClient,
  RevokeOAuthClientsRequest,
} from "metabase-types/api";

import { getOAuthClientName } from "../utils";

type UseClientRevocationOptions = {
  onRevoked: () => void;
};

export function useClientRevocation({ onRevoked }: UseClientRevocationOptions) {
  const [revokeOAuthClients, { isLoading: isRevoking }] =
    useRevokeOAuthClientsMutation();

  const { confirmModal, confirmRevoke } =
    useRevocation<RevokeOAuthClientsRequest>({
      revoke: revokeOAuthClients,
      messages: {
        revoked: (count) =>
          ngettext(
            msgid`Revoked ${count} client`,
            `Revoked ${count} clients`,
            count,
          ),
        raced: (count) =>
          ngettext(
            msgid`${count} new client registered while revoking`,
            `${count} new clients registered while revoking`,
            count,
          ),
        failed: t`Could not revoke clients.`,
      },
      onRevoked,
    });

  const revokeSelected = useCallback(
    (clients: OAuthClient[]) => {
      const request = { ids: clients.map((client) => client.client_id) };
      const count = clients.length;

      if (count === 1) {
        const [onlyClient] = clients;
        const name = getOAuthClientName(onlyClient);
        confirmRevoke({
          title: t`Revoke this client?`,
          message: t`${name} will lose access for everyone who connected it, and will need to be approved again. This can't be undone.`,
          request,
        });
        return;
      }

      confirmRevoke({
        title: ngettext(
          msgid`Revoke ${count} client?`,
          `Revoke ${count} clients?`,
          count,
        ),
        message: t`Everyone who connected them will lose access, and each client will need to be approved again. This can't be undone.`,
        request,
      });
    },
    [confirmRevoke],
  );

  // An empty body, not the filters the page is showing: "revoke all" means every active client, and the endpoint
  // holds back only the client the caller is acting through
  const revokeAll = useCallback(() => {
    confirmRevoke({
      title: t`Revoke all OAuth clients?`,
      message: t`Every connected client will lose access and need to be approved again. This can't be undone.`,
      request: {},
    });
  }, [confirmRevoke]);

  return { isRevoking, confirmModal, revokeSelected, revokeAll };
}
