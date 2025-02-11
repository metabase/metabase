export enum TOKEN {
  Operator = 1,
  Number = 2,
  String = 3,
  Identifier = 4,
  Boolean = 5,
}

export enum OPERATOR {
  Comma = ",",
  OpenParenthesis = "(",
  CloseParenthesis = ")",
  Plus = "+",
  Minus = "-",
  Star = "*",
  Slash = "/",
  Equal = "=",
  NotEqual = "!=",
  LessThan = "<",
  GreaterThan = ">",
  LessThanEqual = "<=",
  GreaterThanEqual = ">=",
  Not = "not",
  And = "and",
  Or = "or",
  True = "true",
  False = "false",
}

export type Optional<T, K extends keyof T> = Omit<T, K> & {
  [P in keyof T]?: T[P] | undefined;
};
