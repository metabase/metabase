import { ParameterTarget } from "metabase-types/types/Parameter";
import { Parameter, ParameterId } from "./parameters";

import type { Card, CardId } from "./card";
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
}

export type DashCardId = number;

export type BaseDashboardOrderedCard = {
  id: DashCardId;
  dashboard_id: DashboardId;
  size_x: number;
  size_y: number;
  visualization_settings?: {
    [key: string]: unknown;
    virtual_card?: Card;
  };
};

export type DashboardOrderedCard = BaseDashboardOrderedCard & {
  card_id: CardId;
  card: Card;
  parameter_mappings?: DashboardParameterMapping[] | null;
  series?: Card[];
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
