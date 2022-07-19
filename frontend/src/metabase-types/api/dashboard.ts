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
}

export type DashboardOrderedCard = {
  id: number;
  card: SavedCard;
  card_id: CardId;
  parameter_mappings?: DashboardParameterMapping[] | null;
  series?: SavedCard[];
};

export type DashboardParameterMapping = {
  card_id: CardId;
  parameter_id: ParameterId;
  target: ParameterTarget;
};
