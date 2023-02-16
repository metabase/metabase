import { Parameter } from "metabase-types/api/parameters";
import type { EntityId } from "metabase-types/types";
import type {
  ParameterTarget,
  ParameterId,
} from "metabase-types/types/Parameter";
import { LinkCardSettings } from "metabase/visualizations/visualizations/LinkViz/types";
import { ActionDashboardCard } from "./actions";

import type { Card, CardId } from "./card";
import type { Dataset } from "./dataset";

export type DashboardId = number;

export interface Dashboard {
  id: DashboardId;
  collection_id: number | null;
  name: string;
  description: string | null;
  model?: string;
  ordered_cards: (DashboardOrderedCard | ActionDashboardCard)[];
  parameters?: Parameter[] | null;
  can_write: boolean;
  cache_ttl: number | null;
  "last-edit-info": {
    id: number;
    email: string;
    first_name: string;
    last_name: string;
    timestamp: string;
  };
}

export type DashCardId = EntityId;

export type BaseDashboardOrderedCard = {
  id: DashCardId;
  dashboard_id: DashboardId;
  size_x: number;
  size_y: number;
  col: number;
  row: number;
  entity_id: string;
  visualization_settings?: {
    [key: string]: unknown;
    virtual_card?: VirtualCard;
    link?: LinkCardSettings;
  };
  justAdded?: boolean;
  created_at: string;
  updated_at: string;
};

export type VirtualCardDisplay = "text" | "action" | "link";

export type VirtualCard = Partial<Card> & {
  display: VirtualCardDisplay;
};

export type DashboardOrderedCard = BaseDashboardOrderedCard & {
  card_id: CardId | null;
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
