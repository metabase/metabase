/**
 * ⚠️
 * @deprecated use existing types from, or add to metabase-types/api/*
 */

import { CardId, SavedCard } from "./Card";
import { VisualizationSettings } from "metabase-types/api/card";
import { Parameter, ParameterMapping } from "./Parameter";

export type DashboardId = number;

export type Dashboard = {
  id: DashboardId;
  name: string;
  favorite: boolean;
  archived: boolean;
  created_at?: string;
  creator_id: number;
  description?: string;
  caveats?: string;
  points_of_interest?: string;
  show_in_getting_started?: boolean;
  // incomplete
  parameters: Array<Parameter>;
  collection_id?: number;
};

// TODO Atte Keinänen 4/5/16: After upgrading Flow, use spread operator `...Dashboard`
export type DashboardWithCards = {
  id: DashboardId;
  name: string;
  description?: string;
  ordered_cards: Array<DashCard>;
  embedding_params: Record<string, any>;
  // incomplete
  parameters: Array<Parameter>;
  collection_id?: number;
};

export type DashCardId = number;

export type DashCard<CardType = SavedCard> = {
  id: DashCardId;

  card_id: CardId;
  dashboard_id: DashboardId;

  card: CardType;
  series: Array<CardType>;

  // incomplete
  parameter_mappings: Array<ParameterMapping>;
  visualization_settings: VisualizationSettings;

  col: number;
  row: number;
  size_y: number;
  size_x: number;

  isAdded?: boolean;
  isDirty?: boolean;
  justAdded?: boolean;
};
