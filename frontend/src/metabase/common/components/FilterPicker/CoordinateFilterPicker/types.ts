export type Operator =
  | "="
  | "!="
  | ">"
  | "<"
  | "between"
  | "inside"
  | ">="
  | "<=";

export interface Option {
  name: string;
  operator: Operator;
  valueCount: number;
}
