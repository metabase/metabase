import type {
  ChannelApiResponse,
  DashboardSubscription,
} from "metabase-types/api";

/**
 * Represents the draft state during pulse editing.
 * Contains all fields that can be set by the user, with optional fields for server-generated data.
 */
export type DraftDashboardSubscription = Pick<
  DashboardSubscription,
  "cards" | "channels"
> &
  Partial<
    Pick<
      DashboardSubscription,
      | "id"
      | "name"
      | "dashboard_id"
      | "parameters"
      | "skip_if_empty"
      | "archived"
      | "can_write"
      | "collection_id"
      | "collection_position"
      | "created_at"
      | "creator"
      | "creator_id"
      | "disable_links"
      | "entity_id"
      | "updated_at"
    >
  >;

/**
 * Union type for pulse that can be either a complete DashboardSubscription
 * or a draft during editing.
 */
export type DashboardSubscriptionData =
  | DashboardSubscription
  | DraftDashboardSubscription;

export interface PulseState {
  editingPulse: DraftDashboardSubscription;
  formInput: ChannelApiResponse;
  cardPreviews: Record<number, { id: number }>;
  pulseList: DashboardSubscription[];
}
