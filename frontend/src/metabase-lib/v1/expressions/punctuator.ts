import type { NodeType } from "./pratt";
import {
  ADD,
  COMMA,
  COMPARISON,
  EQUALITY,
  GROUP,
  GROUP_CLOSE,
  LOGICAL_AND,
  LOGICAL_NOT,
  LOGICAL_OR,
  MULDIV_OP,
  SUB,
} from "./pratt/syntax";

export enum PUNCTUATOR {
  Comma = ",",
  OpenParenthesis = "(",
  CloseParenthesis = ")",
  Plus = "+",
  Minus = "-",
  Multiply = "*",
  Divide = "/",
  Equal = "=",
  NotEqual = "!=",
  LessThan = "<",
  GreaterThan = ">",
  LessThanEqual = "<=",
  GreaterThanEqual = ">=",
  Not = "not",
  And = "and",
  Or = "or",
}

const OPERATOR_TO_TYPE: Record<PUNCTUATOR, NodeType> = {
  [PUNCTUATOR.Comma]: COMMA,
  [PUNCTUATOR.OpenParenthesis]: GROUP,
  [PUNCTUATOR.CloseParenthesis]: GROUP_CLOSE,
  [PUNCTUATOR.Plus]: ADD,
  [PUNCTUATOR.Minus]: SUB,
  [PUNCTUATOR.Multiply]: MULDIV_OP,
  [PUNCTUATOR.Divide]: MULDIV_OP,
  [PUNCTUATOR.Equal]: EQUALITY,
  [PUNCTUATOR.NotEqual]: EQUALITY,
  [PUNCTUATOR.LessThan]: COMPARISON,
  [PUNCTUATOR.GreaterThan]: COMPARISON,
  [PUNCTUATOR.GreaterThanEqual]: COMPARISON,
  [PUNCTUATOR.LessThanEqual]: COMPARISON,
  [PUNCTUATOR.Not]: LOGICAL_NOT,
  [PUNCTUATOR.And]: LOGICAL_AND,
  [PUNCTUATOR.Or]: LOGICAL_OR,
};

export function parsePunctuator(op: string): NodeType | null {
  const lower = op.toLowerCase();
  if (lower in OPERATOR_TO_TYPE) {
    return OPERATOR_TO_TYPE[lower as keyof typeof OPERATOR_TO_TYPE];
  }
  return null;
}
