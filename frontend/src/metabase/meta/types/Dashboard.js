/* @flow */

import type { CardObject, CardId, VisualizationSettings } from "./Card";
import type { ConcreteField } from "./Query";

export type DashboardId = number;

export type DashboardObject = {
    id: DashboardId,
    ordered_cards: Array<DashCardObject>,
    // incomplete
    parameters: Array<ParameterObject>
};

export type DashCardId = number;

export type DashCardObject = {
    id: DashCardId,
    card_id: CardId,
    dashboard_id: DashboardId,

    card: CardObject,
    series: Array<CardObject>,

    // incomplete

    parameter_mappings: Array<ParameterMappingObject>,
    visualization_settings: VisualizationSettings,

    col: number,
    row: number,
    sizeY: number,
    sizeX: number
};

export type ParameterId = string;

export type ParameterType = string;

export type ParameterObject = {
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
    target: ParameterMappingTarget
};

export type ParameterMappingObject = {
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
