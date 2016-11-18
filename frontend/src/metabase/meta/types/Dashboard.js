/* @flow */

import type { Card, CardId, VisualizationSettings } from "./Card";

import type { ConcreteField } from "./Query";

export type DashboardId = number;

export type Dashboard = {
    id: DashboardId,
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

export type ParameterId = string;

export type ParameterType = string;

export type Parameter = {
    id: ParameterId,
    name: string,
    type: ParameterType,
    default?: string
};

export type VariableTarget = ["template-tag", string];
export type DimensionTarget = ["template-tag", string] | ConcreteField

export type ParameterMappingTarget =
    ["variable", VariableTarget] |
    ["dimension", DimensionTarget];

export type ParameterMappingOption = {
    name: string,
    target: ParameterMappingTarget,
};

export type ParameterMapping = {
    card_id: CardId,
    parameter_id: ParameterId,
    target: ParameterMappingTarget
};

export type ParameterOption = {
    name: string,
    description?: string,
    type: ParameterType
};

export type ParameterInstance = {
    type: ParameterType,
    target: ParameterMappingTarget,
    value: string
};



export type ParameterMappingUIOption = ParameterMappingOption & {
    icon: ?string,
    sectionName: string,
    isFk?: boolean,
    isVariable?: boolean,
}
