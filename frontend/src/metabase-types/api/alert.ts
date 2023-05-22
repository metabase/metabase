import { Card } from "./card";
import { CollectionId } from "./collection";
import { DashboardId } from "./dashboard";
import { Channel } from "./notifications";
import { Parameter } from "./parameters";
import { UserId, UserInfo } from "./user";

export interface Alert {
  id: number;
  name: string | null;

  alert_above_goal: boolean | null;
  alert_condition: "goal" | "rows";
  alert_first_only: boolean;
  skip_if_empty: boolean;

  card: Card;
  parameters: Parameter[];
  channels: Channel[];

  dashboard_id: DashboardId | null;
  collection_id: CollectionId | null;
  collection_position: number | null;

  can_write: boolean;
  archived: boolean;

  entity_id: string;

  creator_id: UserId;
  creator: UserInfo;

  created_at: string;
  updated_at: string;
}
