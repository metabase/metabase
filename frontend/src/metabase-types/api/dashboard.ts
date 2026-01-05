import type {
  EmbeddingParameters,
  EmbeddingType,
} from "metabase/public/lib/types";
import type {
  BaseEntityId,
  CardDisplayType,
  ClickBehavior,
  Collection,
  CollectionAuthorityLevel,
  CollectionId,
  Database,
  Field,
  FieldId,
  Parameter,
  ParameterId,
  ParameterTarget,
  ParameterValueOrArray,
  Table,
  UserId,
  UserInfo,
  VirtualCardDisplay,
  VisualizerVizDefinition,
} from "metabase-types/api";
import type { EntityToken, EntityUuid } from "metabase-types/api/entity";

import type {
  ActionDisplayType,
  WritebackAction,
  WritebackActionId,
} from "./actions";
import type { Card, CardId, VisualizationSettings } from "./card";
import type { Dataset } from "./dataset";
import type { ModerationReview } from "./moderation";
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
  entity_id: BaseEntityId;
  created_at: string;
  creator_id: UserId;
  creator?: UserInfo;
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
  is_remote_synced?: boolean;
  public_uuid: string | null;
  initially_published_at: string | null;
  embedding_params?: EmbeddingParameters | null;
  width: DashboardWidth;
  param_fields?: Record<ParameterId, Field[]>;

  moderation_reviews: ModerationReview[];
  view_count?: number;

  /* Indicates whether static embedding for this dashboard has been published */
  enable_embedding: boolean;
  embedding_type?: EmbeddingType | null;

  /* For x-ray dashboards */
  transient_name?: string;
  related?: RelatedDashboardXRays;
  more?: string | null;
}

export type RelatedDashboardXRays = {
  related?: RelatedDashboardXRayItem[];
  "zoom-in"?: RelatedDashboardXRayItem[];
  "zoom-out"?: RelatedDashboardXRayItem[];
  compare?: RelatedDashboardXRayItem[];
};

export type RelatedDashboardXRayItem = {
  description: string;
  title: string;
  url: string;
};

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
  iframe?: string;
};

export type BaseDashboardCard = DashboardCardLayoutAttrs & {
  id: DashCardId;
  dashboard_id: DashboardId;
  dashboard_tab_id: DashboardTabId | null;
  card_id: CardId | null;
  card: Card | VirtualCard;
  collection_authority_level?: CollectionAuthorityLevel;
  entity_id: BaseEntityId;
  visualization_settings?: DashCardVisualizationSettings;
  justAdded?: boolean;
  created_at: string;
  updated_at: string;
};

export type VirtualCard = Partial<
  Omit<Card, "name" | "dataset_query" | "visualization_settings" | "display">
> & {
  name: null;
  dataset_query?: Record<string, never>; // Some old virtual cards have dataset_query equal to {}
  display: VirtualCardDisplay;
  visualization_settings: VisualizationSettings;
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
  inline_parameters: ParameterId[] | null;
  parameter_mappings?: DashboardParameterMapping[] | null;
  series?: Card[];
};

export type VisualizerDashboardCard = QuestionDashboardCard & {
  visualization_settings: BaseDashboardCard["visualization_settings"] & {
    visualization: VisualizerVizDefinition;
  };
};

export type VirtualDashboardCard = BaseDashboardCard & {
  card_id: null;
  card: VirtualCard;
  inline_parameters: ParameterId[] | null;
  parameter_mappings?: VirtualDashCardParameterMapping[] | null;
  visualization_settings: BaseDashboardCard["visualization_settings"] & {
    virtual_card: VirtualCard;
    link?: LinkCardSettings;
    text?: string;
  };
};

export type DashboardTabId = number;

export type DashboardTab = {
  id: DashboardTabId;
  dashboard_id: DashboardId;
  entity_id?: BaseEntityId;
  name: string;
  position?: number;
  created_at?: string;
  updated_at?: string;
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
  collection_position?: number | null;
  caveats?: string | null;
  position?: number | null;
} & Partial<
  Pick<
    Dashboard,
    | "parameters"
    | "point_of_interest"
    | "description"
    | "archived"
    | "dashcards"
    | "tabs"
    | "show_in_getting_started"
    | "enable_embedding"
    | "embedding_type"
    | "collection_id"
    | "name"
    | "width"
    | "embedding_params"
    | "cache_ttl"
  >
>;

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

export type UpdateDashboardPropertyRequest<
  Key extends keyof UpdateDashboardRequest,
> = Required<Pick<UpdateDashboardRequest, "id" | Key>>;

export type GetPublicDashboard = Pick<Dashboard, "id" | "name" | "public_uuid">;

export type GetEmbeddableDashboard = Pick<Dashboard, "id" | "name">;

export type GetRemappedDashboardParameterValueRequest = {
  dashboard_id?: DashboardId;
  entityIdentifier?: EntityUuid | EntityToken;
  parameter_id: ParameterId;
  value: ParameterValueOrArray;
};

export type GetValidDashboardFilterFieldsRequest = {
  filtered: FieldId[];
  filtering: FieldId[];
};
