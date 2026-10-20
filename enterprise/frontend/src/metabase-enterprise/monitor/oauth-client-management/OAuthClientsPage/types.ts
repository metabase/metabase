import type { MonitorTimePreset } from "metabase/monitor/time-presets";
import type {
  OAuthClientId,
  OAuthClientSortColumn,
  OAuthClientStatus,
  SortDirection,
  UserId,
} from "metabase-types/api";

export type OAuthClientsTab = OAuthClientStatus;

export type OAuthClientsUrlState = {
  page: number;
  query: string;
  tab: OAuthClientsTab;
  registered: MonitorTimePreset | null;
  /** Clients this user holds a live token on. */
  user: UserId | null;
  last_used: MonitorTimePreset | null;
  sort_column: OAuthClientSortColumn;
  sort_direction: SortDirection;
};

export type RouteParams = {
  clientId?: OAuthClientId;
};
