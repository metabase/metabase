import type { Card } from "./card";
import type { RegularCollectionId } from "./collection";
import type { DashCardId, DashboardCard, DashboardId } from "./dashboard";
import type { BaseEntityId } from "./entity-id";
import type { Channel } from "./notification-channels";
import type { Parameter } from "./parameters";
import type { User } from "./user";

export interface ListSubscriptionsRequest {
  archived?: boolean;
  dashboard_id?: DashboardId;
  creator_or_recipient?: boolean;
}

export interface DashboardSubscription {
  archived: boolean;
  can_write: boolean;
  cards: SubscriptionSupportingCard[];
  channels: Channel[];
  collection_id: RegularCollectionId | null;
  collection_position: number | null;
  created_at: string;
  creator: User;
  creator_id: number;
  dashboard_id: DashboardId;
  disable_links: boolean;
  entity_id: BaseEntityId;
  id: number;
  name: string | null;
  parameters: Parameter[];
  skip_if_empty: boolean;
  updated_at: string;
}

export interface CreateSubscriptionRequest {
  name: string;
  cards: Card[];
  channels: Channel[];
  skip_if_empty?: boolean;
  collection_id?: RegularCollectionId | null;
  collection_position?: number | null;
  dashboard_id?: DashboardId;
  parameters?: Parameter[];
}

export interface UpdateSubscriptionRequest {
  id: number;
  name?: string;
  cards?: Card[];
  channels?: Channel[];
  skip_if_empty?: boolean;
  collection_id?: RegularCollectionId | null;
  collection_position?: number | null;
  dashboard_id?: DashboardId;
  parameters?: Parameter[];
  archived?: boolean;
  can_write?: boolean;
}

export type SubscriptionSupportingCard = Pick<
  DashboardCard["card"],
  "id" | "collection_id" | "description" | "display" | "name" | "download_perms"
> & {
  include_csv: boolean;
  include_xls: boolean;
  dashboard_card_id: DashCardId;
  dashboard_id: DashboardId;
  parameter_mappings: DashboardCard["parameter_mappings"];
  format_rows?: boolean;
  pivot_results?: boolean;
};
