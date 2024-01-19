import type {
  Collection,
  CollectionAuthorityLevel,
  Parameter,
  ParameterId,
  ParameterTarget,
} from "metabase-types/api";

import type { ActionDashboardCard } from "./actions";
import type { SearchModelType } from "./search";
import type { Card, CardId, CardDisplayType } from "./card";
import type { Dataset } from "./dataset";

// x-ray dashboard have string ids
export type DashboardId = number | string;

export interface Dashboard {
  id: DashboardId;
  collection?: Collection | null;
  collection_id: number | null;
  name: string;
  description: string | null;
  model?: string;
  dashcards: (DashboardCard | ActionDashboardCard)[];
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
  embedding_params?: Record<string, string> | null;

  /* Indicates whether static embedding for this dashboard has been published */
  enable_embedding: boolean;
}

export type DashCardId = number;

export type BaseDashboardCard = {
  id: DashCardId;
  dashboard_id: DashboardId;
  dashboard_tab_id?: DashboardTabId;
  collection_authority_level?: CollectionAuthorityLevel;
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

export type VirtualCardDisplay = "text" | "action" | "link" | "heading";

export type VirtualCard = Partial<Card> & {
  display: VirtualCardDisplay;
};

export type DashboardCard = BaseDashboardCard & {
  card_id: CardId | null;
  card: Card;
  parameter_mappings?: DashboardParameterMapping[] | null;
  series?: Card[];
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
