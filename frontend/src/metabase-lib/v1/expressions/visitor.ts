import type { Expression, ExpressionOperand } from "metabase-types/api";

import { isCaseOrIf, isFunction } from "./matchers";

type ExpressionNode =
  | Expression
  | ExpressionOperand
  | number
  | bigint
  | string
  | boolean;

type Visitor = (expression: ExpressionNode) => void;

export function visit(node: ExpressionNode, visitor: Visitor) {
  visitor(node);

  if (isCaseOrIf(node)) {
    const pairs = node[1];
    for (const pair of pairs) {
      visit(pair[0], visitor);
      visit(pair[1], visitor);
    }
    if (node[2]?.default !== undefined) {
      visit(node[2].default, visitor);
    }
  }

  if (isFunction(node)) {
    const [_operator, ...operands] = node;
    for (const operand of operands) {
      visit(operand, visitor);
    }
  }
}
