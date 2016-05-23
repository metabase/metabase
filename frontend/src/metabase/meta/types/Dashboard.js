/* @flow */

import type { CardObject, CardId } from "./Card";
import type { ConcreteField } from "./Query";


type DashboardObject = {
    id: number,
    ordered_cards: Array<DashCardObject>,
    // incomplete
    parameters: Array<ParameterObject>
};

type DashCardObject = {
    id: number,
    series: Array<CardObject>,
    // incomplete
    parameter_mappings: Array<ParameterMappingObject>;
};

type ParameterId = string;

type ParameterType =
    "date-range" |
    "category" |
    "id";

type ParameterObject = {
    id: ParameterId,
    name: string,
    type: ParameterType,
    default: any
};

type ParameterMappingTarget =
    ["parameter", string] |
    ["dimension", ConcreteField];

type ParameterMappingObject = {
    card_id: CardId,
    parameter_id: ParameterId,
    target: ParameterMappingTarget
};
