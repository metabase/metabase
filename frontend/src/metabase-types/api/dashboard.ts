import type { EntityId } from "metabase-types/types";
import type {
  ParameterTarget,
  ParameterId,
} from "metabase-types/types/Parameter";

import type { ActionDisplayType, WritebackAction } from "./actions";
import type { Card, CardId } from "./card";
import type { ClickBehavior } from "./click-behavior";
import type { Dataset } from "./dataset";
import type { Parameter } from "./parameters";

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
  visualization_settings?: {
    [key: string]: unknown;
    virtual_card?: Card;
  };

  // set and used by the frontend
  isAdded?: boolean;
  justAdded?: boolean;
};

export type DashboardOrderedCard = BaseDashboardOrderedCard & {
  card_id: CardId;
  card: Card;
  parameter_mappings?: DashboardParameterMapping[] | null;
  series?: Card[];
};

export interface ActionDashboardCard
  extends Omit<BaseDashboardOrderedCard, "parameter_mappings"> {
  action?: WritebackAction;
  card_id?: number; // model card id for the associated action
  card?: Card;

  parameter_mappings?: ActionParametersMapping[] | null;
  visualization_settings: {
    [key: string]: unknown;
    "button.label"?: string;
    click_behavior?: ClickBehavior;
    actionDisplayType?: ActionDisplayType;
  };
}

export type ActionParametersMapping = Pick<
  DashboardParameterMapping,
  "parameter_id" | "target"
>;

export type DashboardParameterMapping = {
  card_id: CardId;
  parameter_id: ParameterId;
  target: ParameterTarget;
};

export type DashCardDataMap = Record<
  DashCardId,
  Record<CardId, Dataset | undefined>
>;
