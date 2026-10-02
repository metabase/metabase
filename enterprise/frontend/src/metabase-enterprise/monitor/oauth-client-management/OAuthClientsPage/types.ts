import type { MonitorTimePreset } from "metabase/monitor/time-presets";
import type {
  OAuthClientId,
  OAuthClientSortColumn,
  OAuthClientStatus,
  SortDirection,
  UserId,
} from "metabase-types/api";

/** One tab per client status. `all` is a filter value the list never shows as a tab. */
export type OAuthClientsTab = OAuthClientStatus;

export type OAuthClientsUrlState = {
  page: number;
  query: string;
  tab: OAuthClientsTab;
  /** Registered within this window. Both tabs offer it: a revoked client registered too. */
  registered: MonitorTimePreset | null;
  /** Clients this user still holds a token on. */
  user: UserId | null;
  sort_column: OAuthClientSortColumn;
  sort_direction: SortDirection;
};

/** The sidebar is routed by the client it is open on, so page, tab and search stay in the query string. */
export type RouteParams = {
  clientId?: OAuthClientId;
};
