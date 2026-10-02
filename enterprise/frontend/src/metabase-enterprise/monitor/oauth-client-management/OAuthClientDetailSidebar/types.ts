import type {
  OAuthClient,
  OAuthClientDetail,
  OAuthClientId,
  OAuthClientUser,
} from "metabase-types/api";

export type OAuthClientDetailSidebarProps = {
  clientId: OAuthClientId;
  /** The row the list already has, shown while the detail is fetched on top of it. */
  clientFromPage: OAuthClient | undefined;
  prevClientId: OAuthClientId | undefined;
  nextClientId: OAuthClientId | undefined;
  isRevoking: boolean;
  onNavigate: (clientId: OAuthClientId) => void;
  onRevokeClient: (client: OAuthClient) => void;
  onClose: () => void;
};

export type SidebarHeaderProps = {
  clientId: OAuthClientId;
  client: OAuthClient | undefined;
  prevClientId: OAuthClientId | undefined;
  nextClientId: OAuthClientId | undefined;
  onNavigate: (clientId: OAuthClientId) => void;
  onClose: () => void;
};

export type ClientDetailsProps = {
  client: OAuthClient;
  /** Absent until the detail request lands: `scopes` and `contacts` are not in the list item. */
  detail: OAuthClientDetail | undefined;
};

export type ClientUsersProps = {
  /** Absent until the detail request lands: the list item carries only the count. */
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
