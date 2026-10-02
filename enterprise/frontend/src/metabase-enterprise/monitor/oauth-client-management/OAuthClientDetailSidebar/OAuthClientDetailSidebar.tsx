import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { DetailSidebarShell } from "metabase/monitor/components/DetailSidebar";
import { Text } from "metabase/ui";

import { ClientActivity } from "./ClientActivity";
import { ClientDetails } from "./ClientDetails";
import { ClientTitle } from "./ClientTitle";
import { ClientUsers } from "./ClientUsers";
import { SidebarFooter } from "./SidebarFooter";
import { SidebarHeader } from "./SidebarHeader";
import type { OAuthClientDetailSidebarProps } from "./types";
import { useShownClient } from "./use-shown-client";

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
  const { client, detail, isLoading, error } = useShownClient(
    clientId,
    clientFromPage,
  );

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
        prevClientId={prevClientId}
        nextClientId={nextClientId}
        onNavigate={onNavigate}
        onClose={onClose}
      />
      <LoadingAndErrorWrapper loading={isLoading} error={error} noWrapper>
        {client ? (
          <>
            <ClientTitle client={client} />
            <ClientDetails client={client} detail={detail} />
            <ClientUsers users={detail?.users} />
            <ClientActivity clientId={clientId} />
          </>
        ) : (
          <Text c="text-secondary">{t`This client is no longer registered.`}</Text>
        )}
      </LoadingAndErrorWrapper>
    </DetailSidebarShell>
  );
};
