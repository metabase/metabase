/**
 * ⚠️
 * @deprecated use existing types from, or add to metabase-types/api/*
 */

import { CardId } from "./Card";
import { LocalFieldReference, ForeignFieldReference } from "./Query";

export type ParameterId = string;

export type ParameterType = string;

export type VariableTarget = ["template-tag", string];
export type ParameterVariableTarget = ["variable", VariableTarget];
export type DimensionTarget = LocalFieldReference | ForeignFieldReference;
export type ParameterDimensionTarget = [
  "dimension",
  DimensionTarget | VariableTarget,
];

export type ParameterValueOrArray = string | number | Array<any>;

export type ParameterTarget =
  | ParameterVariableTarget
  | ParameterDimensionTarget;

export type ParameterMapping = {
  card_id: CardId;
  parameter_id: ParameterId;
  target: ParameterTarget;
};

export type ParameterMappingOptions = {
  name: string;
  sectionId: string;
  combinedName?: string;
  type: ParameterType;
};

export interface Parameter {
  id: ParameterId;
  name: string;
  type: ParameterType;
  slug: string;
  sectionId?: string;
  default?: any;
  filteringParameters?: ParameterId[];
  isMultiSelect?: boolean;
  value?: any;
}

export type ParameterQueryObject = {
  type: ParameterType;
  target: ParameterTarget;
  value: ParameterValueOrArray;
};
