import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { DetailSidebarShell } from "metabase/monitor/components/DetailSidebar";
import { Stack, Text } from "metabase/ui";
import { isResourceNotFoundError } from "metabase/utils/errors";
import { useGetOAuthClientQuery } from "metabase-enterprise/api";

import { ClientActivity } from "./ClientActivity";
import { ClientDetails } from "./ClientDetails";
import { ClientUsers } from "./ClientUsers";
import { SidebarFooter } from "./SidebarFooter";
import { SidebarHeader } from "./SidebarHeader";
import type { OAuthClientDetailSidebarProps } from "./types";

export const OAuthClientDetailSidebar = ({
  clientId,
  clientFromPage,
  prevClientId,
  nextClientId,
  isRevoking,
  onNavigate,
  onRevokeClient,
  onClose,
}: OAuthClientDetailSidebarProps) => {
  // Always fetched: the scopes, contacts and users are the detail's own, whether or not the list handed over a row
  const { currentData: detail, error } = useGetOAuthClientQuery(clientId);
  // A 404 is an answer rather than a failure: the id in the URL names no registered client. It also beats the row
  // the list handed over, which is a snapshot the server has since contradicted.
  const isUnknownClient = isResourceNotFoundError(error);
  const client = isUnknownClient ? undefined : (detail ?? clientFromPage);

  // Revoking the client the caller is acting through would cut them off mid-request, as on the list
  const revocableClient =
    client?.status === "active" && !client.current ? client : undefined;

  return (
    <DetailSidebarShell
      data-testid="oauth-client-detail-sidebar"
      footer={
        revocableClient && (
          <SidebarFooter
            client={revocableClient}
            isRevoking={isRevoking}
            onRevokeClient={onRevokeClient}
          />
        )
      }
    >
      <SidebarHeader
        clientId={clientId}
        client={client}
        prevClientId={prevClientId}
        nextClientId={nextClientId}
        onNavigate={onNavigate}
        onClose={onClose}
      />
      <LoadingAndErrorWrapper
        loading={client === undefined && !isUnknownClient}
        error={isUnknownClient ? undefined : error}
        noWrapper
      >
        {client ? (
          <Stack gap="xl">
            <ClientDetails client={client} detail={detail} />
            <ClientUsers users={detail?.users} />
            <ClientActivity clientId={clientId} />
          </Stack>
        ) : (
          <Text c="text-secondary">{t`This client is no longer registered.`}</Text>
        )}
      </LoadingAndErrorWrapper>
    </DetailSidebarShell>
  );
};
