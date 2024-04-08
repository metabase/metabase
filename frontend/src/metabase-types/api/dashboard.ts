import type { EmbeddingParameters } from "metabase/public/lib/types";
import type {
  ClickBehavior,
  Collection,
  CollectionAuthorityLevel,
  CollectionId,
  Parameter,
  ParameterId,
  ParameterTarget,
} from "metabase-types/api";

import type {
  ActionDisplayType,
  WritebackAction,
  WritebackActionId,
} from "./actions";
import type { Card, CardId, CardDisplayType } from "./card";
import type { Dataset } from "./dataset";
import type { SearchModelType } from "./search";

// x-ray dashboard have string ids
export type DashboardId = number | string;

export type DashboardCard =
  | ActionDashboardCard
  | QuestionDashboardCard
  | VirtualDashboardCard;

export type DashboardWidth = "full" | "fixed";

export interface Dashboard {
  id: DashboardId;
  created_at: string;
  updated_at: string;
  collection?: Collection | null;
  collection_id: CollectionId | null;
  name: string;
  description: string | null;
  model?: string;
  dashcards: DashboardCard[];
  tabs?: DashboardTab[];
  parameters?: Parameter[] | null;
  collection_authority_level?: CollectionAuthorityLevel;
  can_write: boolean;
  cache_ttl: number | null;
  "last-edit-info": {
    id: number;
    email: string;
    first_name: string;
    last_name: string;
    timestamp: string;
  };
  auto_apply_filters: boolean;
  archived: boolean;
  public_uuid: string | null;
  initially_published_at: string | null;
  embedding_params?: EmbeddingParameters | null;
  width: DashboardWidth;

  /* Indicates whether static embedding for this dashboard has been published */
  enable_embedding: boolean;
}

export type DashCardId = number;

export type DashboardCardLayoutAttrs = {
  col: number;
  row: number;
  size_x: number;
  size_y: number;
};

export type DashCardVisualizationSettings = {
  [key: string]: unknown;
  virtual_card?: VirtualCard;
};

export type BaseDashboardCard = DashboardCardLayoutAttrs & {
  id: DashCardId;
  dashboard_id: DashboardId;
  dashboard_tab_id: DashboardTabId | null;
  card_id: CardId | null;
  card: Card | VirtualCard;
  collection_authority_level?: CollectionAuthorityLevel;
  entity_id: string;
  visualization_settings?: DashCardVisualizationSettings;
  justAdded?: boolean;
  created_at: string;
  updated_at: string;
};

export type VirtualCardDisplay =
  | "action"
  | "heading"
  | "link"
  | "placeholder"
  | "text";

export type VirtualCard = Partial<
  Omit<Card, "name" | "dataset_query" | "visualization_settings">
> & {
  name: null;
  dataset_query: Record<string, never>;
  display: VirtualCardDisplay;
  visualization_settings: Record<string, never>;
};

export type ActionDashboardCard = Omit<
  BaseDashboardCard,
  "parameter_mappings"
> & {
  action_id: WritebackActionId;
  action?: WritebackAction;
  card_id: CardId | null; // model card id for the associated action
  card: Card;

  parameter_mappings?: ActionParametersMapping[] | null;
  visualization_settings: DashCardVisualizationSettings & {
    "button.label"?: string;
    click_behavior?: ClickBehavior;
    actionDisplayType?: ActionDisplayType;
    virtual_card: VirtualCard;
  };
};

export type QuestionDashboardCard = BaseDashboardCard & {
  card_id: CardId | null; // will be null for virtual card
  card: Card;
  parameter_mappings?: DashboardParameterMapping[] | null;
  series?: Card[];
};

export type VirtualDashboardCard = BaseDashboardCard & {
  card_id: null;
  card: VirtualCard;
  parameter_mappings?: VirtualDashCardParameterMapping[] | null;
  visualization_settings: BaseDashboardCard["visualization_settings"] & {
    virtual_card: VirtualCard;
    link?: LinkCardSettings;
  };
};

export type DashboardTabId = number;

export type DashboardTab = {
  id: DashboardTabId;
  dashboard_id: DashboardId;
  entity_id: string;
  name: string;
  position?: number;
  created_at: string;
  updated_at: string;
};

export type DashboardParameterMapping = {
  card_id: CardId;
  parameter_id: ParameterId;
  target: ParameterTarget;
};

export type ActionParametersMapping = Pick<
  DashboardParameterMapping,
  "parameter_id" | "target"
>;

export type VirtualDashCardParameterMapping = {
  parameter_id: ParameterId;
  target: ParameterTarget;
};

export type DashCardDataMap = Record<
  DashCardId,
  Record<CardId, Dataset | null | undefined>
>;

export type LinkEntity = RestrictedLinkEntity | UnrestrictedLinkEntity;

export type UnrestrictedLinkEntity = {
  id: number;
  db_id?: number;
  database_id?: number;
  model: SearchModelType;
  name: string;
  display_name?: string;
  description?: string;
  display?: CardDisplayType;
};

export type RestrictedLinkEntity = {
  restricted: true;
};

export interface LinkCardSettings {
  url?: string;
  entity?: LinkEntity;
}

export interface GetCompatibleCardsPayload {
  last_cursor?: number;
  limit: number;
  query?: string;
  exclude_ids: number[];
}
