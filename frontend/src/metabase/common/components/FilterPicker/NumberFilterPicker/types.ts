export type Operator =
  | "="
  | "!="
  | ">"
  | "<"
  | "between"
  | ">="
  | "<="
  | "is-null"
  | "not-null";

export interface Option {
  name: string;
  operator: Operator;
  valueCount: number;
}
