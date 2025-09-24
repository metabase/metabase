type ParameterId = string;

type ParameterValueOrArray =
  | string
  | number
  | boolean
  | Array<string | number | boolean | null>;

export type ParameterValues = Record<
  ParameterId,
  ParameterValueOrArray | null | undefined
>;
