/* @flow */

import type { CardObject, CardId } from "./Card";
import type { ConcreteField } from "./Query";


export type DashboardObject = {
    id: number,
    ordered_cards: Array<DashCardObject>,
    // incomplete
    parameters: Array<ParameterObject>
};

export type DashCardObject = {
    id: number,
    series: Array<CardObject>,
    // incomplete
    parameter_mappings: Array<ParameterMappingObject>;
};

export type ParameterId = string;

export type ParameterType =
    "date-range" |
    "category" |
    "id";

export type ParameterObject = {
    id: ParameterId,
    name: string,
    type: ParameterType,
    default: any
};

export type ParameterMappingTarget =
    ["parameter", string] |
    ["dimension", ConcreteField];

export type ParameterMappingObject = {
    card_id: CardId,
    parameter_id: ParameterId,
    target: ParameterMappingTarget
};
