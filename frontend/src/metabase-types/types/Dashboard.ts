import type { Card, CardId, VisualizationSettings } from "./Card";
import type { Parameter, ParameterMapping } from "./Parameter";
import type { EmbeddingParams } from "metabase/public/lib/types";

export type DashboardId = number;

export type Dashboard = {
  id: DashboardId,
  name: string,
  favorite: boolean,
  archived: boolean,
  created_at?: string | null,
  creator_id: number,
  description?: string | null,
  caveats?: string,
  points_of_interest?: string,
  show_in_getting_started?: boolean,
  // incomplete
  parameters: Array<Parameter>,
  collection_id?: number | null,
};

// TODO Atte Keinänen 4/5/16: After upgrading Flow, use spread operator `...Dashboard`
export type DashboardWithCards = {
  id: DashboardId,
  name: string,
  description?: string | null,
  ordered_cards: Array<DashCard>,
  embedding_params: EmbeddingParams,
  // incomplete
  parameters: Array<Parameter>,
  collection_id?: number | null,
};

export type DashCardId = number;

export type DashCard = {
  id: DashCardId,

  card_id: CardId,
  dashboard_id: DashboardId,

  card: Card,
  series: Array<Card>,

  // incomplete
  parameter_mappings: Array<ParameterMapping>,
  visualization_settings: VisualizationSettings,

  col: number,
  row: number,
  sizeY: number,
  sizeX: number,
};
