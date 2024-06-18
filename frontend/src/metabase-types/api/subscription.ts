import type { Card } from "./card";
import type { RegularCollectionId } from "./collection";
import type { DashboardId } from "./dashboard";
import type { Channel } from "./notifications";
import type { Parameter } from "./parameters";
import type { User } from "./user";

export interface ListSubscriptionsRequest {
  archived?: boolean;
  dashboard_id?: DashboardId;
  creator_or_recipient?: boolean;
}

export interface DashboardSubscription {
  archived: boolean;
  cards: Card[];
  channels: Channel[];
  collection_id: RegularCollectionId | null;
  collection_position: number | null;
  created_at: string;
  creator: User;
  creator_id: number;
  dashboard_id: DashboardId;
  entity_id: string;
  id: number;
  name: string;
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
