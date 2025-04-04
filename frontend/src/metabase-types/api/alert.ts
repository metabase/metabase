import type { CardId } from "./card";
import type { CollectionId } from "./collection";
import type { DashCardId, DashboardId } from "./dashboard";
import type { BaseEntityId } from "./entity-id";
import type { Channel } from "./notification-channels";
import type { Parameter } from "./parameters";
import type { UserId, UserInfo } from "./user";

export type AlertId = number;
export type AlertCondition = "goal" | "rows";

export interface Alert {
  id: AlertId;
  name: string | null;

  alert_above_goal: boolean | null;
  alert_condition: AlertCondition;
  alert_first_only: boolean;
  skip_if_empty: boolean;

  card: AlertCard;
  parameters: Parameter[];
  channels: Channel[];

  dashboard_id: DashboardId | null;
  collection_id: CollectionId | null;
  collection_position: number | null;

  can_write: boolean;
  archived: boolean;

  entity_id: BaseEntityId;

  creator_id: UserId;
  creator: UserInfo;

  created_at: string;
  updated_at: string;
}

export interface AlertCard {
  id: CardId;
  include_csv: boolean;
  include_xls: boolean;
  format_rows?: boolean;
  dashboard_card_id?: DashCardId;
}
