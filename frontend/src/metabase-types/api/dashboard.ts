import {
  ParameterTarget,
  ParameterId,
  Parameter,
} from "metabase-types/types/Parameter";
import { CardId, SavedCard } from "metabase-types/types/Card";

export interface Dashboard {
  id: number;
  name: string;
  model?: string;
  ordered_cards: DashboardOrderedCard[];
  parameters: Parameter[];
}

export type DashboardOrderedCard = {
  id: number;
  card: SavedCard;
  card_id: CardId;
  parameter_mappings: DashboardParameterMapping[];
  series: SavedCard[];
};

export type DashboardParameterMapping = {
  card_id: CardId;
  parameter_id: ParameterId;
  target: ParameterTarget;
};
