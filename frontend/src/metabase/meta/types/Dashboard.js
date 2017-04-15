/* @flow */

import type { Card, CardId, VisualizationSettings } from "./Card";
import type { Parameter, ParameterMapping } from "./Parameter";

export type DashboardId = number;

export type Dashboard = {
    id: DashboardId,
    name: string,
    description: ?string,
    ordered_cards: Array<DashCard>,
    // incomplete
    parameters: Array<Parameter>
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
    sizeX: number
};
