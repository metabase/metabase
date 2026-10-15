import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import {
  DetailSidebarHeader,
  DetailSidebarShell,
  DetailSidebarTitle,
} from "metabase/monitor/components/DetailSidebar";
import { Text } from "metabase/ui";
import * as Urls from "metabase/urls";

import { getOAuthClientName } from "../utils";

import { ClientActivity } from "./ClientActivity";
import { ClientDetails } from "./ClientDetails";
import { ClientUsers } from "./ClientUsers";
import { SidebarFooter } from "./SidebarFooter";
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

  const revocableClient =
    error === undefined && client?.status === "active" ? client : undefined;

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
      <DetailSidebarHeader
        prevId={prevClientId}
        nextId={nextClientId}
        previousLabel={t`Previous client`}
        nextLabel={t`Next client`}
        detailPath={Urls.monitorOAuthClientDetail(clientId)}
        onNavigate={onNavigate}
        onClose={onClose}
      />
      <LoadingAndErrorWrapper loading={isLoading} error={error} noWrapper>
        {client ? (
          <>
            <DetailSidebarTitle
              typeLabel={t`OAuth client`}
              title={getOAuthClientName(client)}
            />
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
