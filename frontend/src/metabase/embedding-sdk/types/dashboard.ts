export type ParameterValues = Record<
  string,
  | string
  | number
  | boolean
  | Array<string | number | boolean | null>
  | null
  | undefined
>;
