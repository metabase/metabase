import * as Lib from "metabase-lib";

type Visitor = (expression: Lib.ExpressionParts | Lib.ExpressionArg) => void;

export function visit(
  node: Lib.ExpressionParts | Lib.ExpressionArg,
  visitor: Visitor,
) {
  visitor(node);

  if (Lib.isExpressionParts(node)) {
    for (const arg of node.args) {
      visit(arg, visitor);
    }
  }
}
