/* @flow */

import type { Card, CardId, VisualizationSettings } from "./Card";
import type { Parameter, ParameterMapping } from "./Parameter";

export type DashboardId = number;

export type Dashboard = {
  id: DashboardId,
  name: string,
  favorite: boolean,
  archived: boolean,
  created_at: ?string,
  creator_id: number,
  description: ?string,
  caveats?: string,
  points_of_interest?: string,
  show_in_getting_started?: boolean,
  // incomplete
  parameters: Array<Parameter>,
  collection_id: ?number,
};

// TODO Atte Keinänen 4/5/16: After upgrading Flow, use spread operator `...Dashboard`
export type DashboardWithCards = {
  id: DashboardId,
  name: string,
  description: ?string,
  ordered_cards: Array<DashCard>,
  // incomplete
  parameters: Array<Parameter>,
  collection_id: ?number,
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
