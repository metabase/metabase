export type Operator =
  | "="
  | "!="
  | "contains"
  | "does-not-contain"
  | "starts-with"
  | "ends-with"
  | "is-empty"
  | "not-empty";

export interface Option {
  name: string;
  operator: Operator;
  valueCount: number;
  hasCaseSensitiveOption?: boolean;
}
