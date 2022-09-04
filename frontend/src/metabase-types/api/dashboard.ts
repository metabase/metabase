import { EntityId } from "metabase-types/types";
import {
  ParameterTarget,
  ParameterId,
  Parameter,
} from "metabase-types/types/Parameter";
import { CardId, SavedCard } from "metabase-types/types/Card";

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

// Used to set values for question filters
// Example: "[\"dimension\",[\"field\",17,null]]"
type StringifiedDimension = string;

export type ClickBehaviorParameterMapping = Record<
  ParameterId | StringifiedDimension,
  {
    id: ParameterId | StringifiedDimension;
    source: {
      id: ParameterId | StringifiedDimension;
      name: string;
      type: "column" | "parameter";
    };
    target: {
      id: ParameterId | StringifiedDimension;
      type: "parameter" | "dimension";
    };
  }
>;

export type ClickBehaviorType =
  | "action"
  | "actionMenu"
  | "crossfilter"
  | "link";

export type CustomDestinationClickBehaviorLinkType =
  | "dashboard"
  | "question"
  | "url";

export interface CrossFilterClickBehavior {
  type: "crossfilter";
  parameterMapping?: ClickBehaviorParameterMapping;
}

export interface EntityCustomDestinationClickBehavior {
  type: "link";
  linkType: "dashboard" | "question";
  targetId: EntityId;
  parameterMapping?: ClickBehaviorParameterMapping;
}

export interface ArbitraryCustomDestinationClickBehavior {
  type: "link";
  linkType: "url";
  linkTemplate: string;
  linkTextTemplate?: string;
}

// Makes click handler use default drills
// This is virtual, i.e. if a card has no clickBehavior,
// it'd behave as if it's an "actionMenu"
export type ActionMenuClickBehavior = {
  type: "actionMenu";
};

export type CustomDestinationClickBehavior =
  | EntityCustomDestinationClickBehavior
  | ArbitraryCustomDestinationClickBehavior;

export type ClickBehavior =
  | ActionMenuClickBehavior
  | CrossFilterClickBehavior
  | CustomDestinationClickBehavior;
