import type {
  OAuthClient,
  OAuthClientDetail,
  OAuthClientId,
  OAuthClientUser,
} from "metabase-types/api";

export type OAuthClientDetailSidebarProps = {
  clientId: OAuthClientId;
  clientFromPage: OAuthClient | undefined;
  prevClientId: OAuthClientId | undefined;
  nextClientId: OAuthClientId | undefined;
  isRevoking: boolean;
  onNavigate: (clientId: OAuthClientId) => void;
  onRevokeClient: (client: OAuthClient) => void;
  onClose: () => void;
};

export type ClientDetailsProps = {
  client: OAuthClient;
  detail: OAuthClientDetail | undefined;
};

export type ClientUsersProps = {
  /** Undefined until the detail lands, as distinct from an empty list. */
  users: OAuthClientUser[] | undefined;
};

export type ClientActivityProps = {
  clientId: OAuthClientId;
};

export type SidebarFooterProps = {
  client: OAuthClient;
  isRevoking: boolean;
  onRevokeClient: (client: OAuthClient) => void;
};
