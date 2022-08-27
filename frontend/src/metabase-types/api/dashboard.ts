import { EntityId } from "metabase-types/types";
import {
  ParameterTarget,
  ParameterId,
  Parameter,
} from "metabase-types/types/Parameter";
import { CardId, SavedCard } from "metabase-types/types/Card";

export interface Dashboard {
  id: number;
  collection_id: number | null;
  name: string;
  description: string | null;
  model?: string;
  ordered_cards: DashboardOrderedCard[];
  parameters?: Parameter[] | null;
  can_write: boolean;
  cache_ttl: number | null;

  // Indicates if a dashboard is a special "app page" type
  // Pages have features like custom action buttons to write back to the database
  // And lack features like dashboard subscriptions, auto-refresh, night-mode
  is_app_page?: boolean;
}

export type DashCardId = EntityId;

export type DashboardOrderedCard = {
  id: DashCardId;
  card: SavedCard;
  card_id: CardId;
  parameter_mappings?: DashboardParameterMapping[] | null;
  series?: SavedCard[];
  visualization_settings?: {
    [key: string]: unknown;
  };
};

export type DashboardParameterMapping = {
  card_id: CardId;
  parameter_id: ParameterId;
  target: ParameterTarget;
};
