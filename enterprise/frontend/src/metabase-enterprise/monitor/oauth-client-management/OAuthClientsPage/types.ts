import type { OAuthClientStatus } from "metabase-types/api";

/** One tab per client status. `all` is a filter value the list never shows as a tab. */
export type OAuthClientsTab = OAuthClientStatus;

export type OAuthClientsUrlState = {
  page: number;
  tab: OAuthClientsTab;
};
