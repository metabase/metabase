import type { NodeType } from "./pratt";
import { NODE_TYPE as t } from "./pratt/syntax";

export type Punctuator = keyof typeof PUNCTUATOR_TO_TYPE;

const PUNCTUATOR_TO_TYPE = {
  ",": t.COMMA,
  "(": t.GROUP,
  ")": t.GROUP_CLOSE,
  "+": t.ADD,
  "-": t.SUB,
  "*": t.MULDIV_OP,
  "/": t.MULDIV_OP,
  "=": t.EQUALITY,
  "!=": t.EQUALITY,
  "<": t.COMPARISON,
  ">": t.COMPARISON,
  "<=": t.COMPARISON,
  ">=": t.COMPARISON,
  not: t.LOGICAL_NOT,
  and: t.LOGICAL_AND,
  or: t.LOGICAL_OR,
} as const;

export function isPunctuator(str: string): str is Punctuator {
  return str in PUNCTUATOR_TO_TYPE;
}

export function parsePunctuator(op: string): NodeType | null {
  const lower = op.toLowerCase();
  if (!isPunctuator(lower)) {
    return null;
  }
  return PUNCTUATOR_TO_TYPE[lower];
}
