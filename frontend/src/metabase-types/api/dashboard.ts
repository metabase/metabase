import type { EntityId } from "metabase-types/types";
import type {
  ParameterTarget,
  ParameterId,
  Parameter,
} from "metabase-types/types/Parameter";

import type { CardId, SavedCard } from "metabase-types/types/Card";
import type { WritebackAction } from "./writeback";

import type { Dataset } from "./dataset";

export type DashboardId = number;

export interface Dashboard {
  id: DashboardId;
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

export type BaseDashboardOrderedCard = {
  id: DashCardId;
  visualization_settings?: {
    [key: string]: unknown;
  };
};

export type DashboardOrderedCard = BaseDashboardOrderedCard & {
  card_id: CardId;
  card: SavedCard;
  parameter_mappings?: DashboardParameterMapping[] | null;
  series?: SavedCard[];
};

export type DashboardParameterMapping = {
  card_id: CardId;
  parameter_id: ParameterId;
  target: ParameterTarget;
};

export type DashCardDataMap = Record<
  DashCardId,
  Record<CardId, Dataset | undefined>
>;
