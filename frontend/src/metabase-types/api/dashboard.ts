import type { EmbeddingParameters } from "metabase/public/lib/types";
import type {
  ClickBehavior,
  Collection,
  CollectionAuthorityLevel,
  CollectionId,
  Database,
  Field,
  Parameter,
  ParameterId,
  ParameterTarget,
  Table,
} from "metabase-types/api";

import type {
  ActionDisplayType,
  WritebackAction,
  WritebackActionId,
} from "./actions";
import type { Card, CardId, CardDisplayType } from "./card";
import type { Dataset } from "./dataset";
import type { SearchModel } from "./search";

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
  show_in_getting_started?: boolean | null;
  parameters?: Parameter[] | null;
  point_of_interest?: string | null;
  collection_authority_level?: CollectionAuthorityLevel;
  can_write: boolean;
  can_restore: boolean;
  can_delete: boolean;
  cache_ttl: number | null;
  "last-edit-info": {
    id: number;
    email: string;
    first_name: string;
    last_name: string;
    timestamp: string;
  };
  last_used_param_values: Record<
    ParameterId,
    string | number | boolean | null | string[] | number[]
  >;
  auto_apply_filters: boolean;
  archived: boolean;
  public_uuid: string | null;
  initially_published_at: string | null;
  embedding_params?: EmbeddingParameters | null;
  width: DashboardWidth;

  /* Indicates whether static embedding for this dashboard has been published */
  enable_embedding: boolean;
}

/** Dashboards with string ids, like x-rays, cannot have cache configurations */
export type CacheableDashboard = Omit<Dashboard, "id"> & { id: number };

export type DashboardQueryMetadata = {
  databases: Database[];
  tables: Table[];
  fields: Field[];
  cards: Card[];
  dashboards: Dashboard[];
};

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
  model: SearchModel;
  name: string;
  display_name?: string;
  description?: string | null;
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

export type ListDashboardsRequest = {
  f?: "all" | "mine" | "archived";
};

// GET /api/dashboard endpoint does not hydrate all Dashboard attributes
export type ListDashboardsResponse = Omit<
  Dashboard,
  | "dashcards"
  | "tabs"
  | "collection"
  | "collection_authority_level"
  | "can_write"
  | "param_fields"
  | "param_values"
>[];

export type GetDashboardRequest = {
  id: DashboardId;
  ignore_error?: boolean;
};

export type CreateDashboardRequest = {
  name: string;
  description?: string | null;
  parameters?: Parameter[] | null;
  cache_ttl?: number;
  collection_id?: CollectionId | null;
  collection_position?: number | null;
  tabs?: Pick<DashboardTab, "id" | "name" | "position">[];
};

export type UpdateDashboardRequest = {
  id: DashboardId;
  parameters?: Parameter[] | null;
  point_of_interest?: string | null;
  description?: string | null;
  archived?: boolean | null;
  dashcards?: DashboardCard[] | null;
  collection_position?: number | null;
  tabs?: DashboardTab[];
  show_in_getting_started?: boolean | null;
  enable_embedding?: boolean | null;
  collection_id?: CollectionId | null;
  name?: string | null;
  width?: DashboardWidth | null;
  caveats?: string | null;
  embedding_params?: EmbeddingParameters | null;
  cache_ttl?: number;
  position?: number | null;
};

export type GetDashboardQueryMetadataRequest = {
  id: DashboardId;
  dashboard_load_id?: string;
};

export type SaveDashboardRequest = Omit<UpdateDashboardRequest, "id">;

export type CopyDashboardRequest = {
  id: DashboardId;
  name?: string | null;
  description?: string | null;
  collection_id?: CollectionId | null;
  collection_position?: number | null;
  is_deep_copy?: boolean | null;
};
