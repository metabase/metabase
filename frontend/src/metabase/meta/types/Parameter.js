/* @flow */

import type { CardId } from "./Card";
import type { LocalFieldReference, ForeignFieldReference } from "./Query";

export type ParameterId = string;

// date/*, category, id, etc
export type ParameterType = string;

// a URL-safe encoding of a parameter value
export type ParameterValue = string;
export type ParameterValueOrArray = string | Array<string>;

export type Parameter = {
  id: ParameterId,
  name: string,
  type: ParameterType,
  slug: string,
  default?: string,

  target?: ParameterTarget,
};

export type VariableTarget = ["template-tag", string];
export type DimensionTarget =
  | ["template-tag", string]
  | LocalFieldReference
  | ForeignFieldReference;

export type ParameterTarget =
  | ["variable", VariableTarget]
  | ["dimension", DimensionTarget];

export type ParameterMappingOption = {
  name: string,
  target: ParameterTarget,
};

export type ParameterMapping = {
  card_id: CardId,
  parameter_id: ParameterId,
  target: ParameterTarget,
};

export type ParameterOption = {
  name: string,
  description?: string,
  type: ParameterType,
};

export type ParameterInstance = {
  type: ParameterType,
  target: ParameterTarget,
  value: ParameterValue,
};

export type ParameterMappingUIOption = ParameterMappingOption & {
  icon: ?string,
  sectionName: string,
  isFk?: boolean,
  isVariable?: boolean,
};

export type ParameterValues = {
  [id: ParameterId]: ParameterValue,
};
