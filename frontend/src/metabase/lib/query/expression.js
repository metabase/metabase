import _ from "underscore";

import type {
  ExpressionName,
  ExpressionClause,
  Expression,
} from "metabase/meta/types/Query";

export function getExpressions(
  expressions: ?ExpressionClause = {},
): ExpressionClause {
  return expressions;
}

export function getExpressionsList(
  expressions: ?ExpressionClause = {},
): Array<{ name: ExpressionName, expression: Expression }> {
  return Object.entries(expressions).map(([name, expression]) => ({
    name,
    expression,
  }));
}

export function addExpression(
  expressions: ?ExpressionClause = {},
  name: ExpressionName,
  expression: Expression,
): ?ExpressionClause {
  return { ...expressions, [name]: expression };
}
export function updateExpression(
  expressions: ?ExpressionClause = {},
  name: ExpressionName,
  expression: Expression,
  oldName?: ExpressionName,
): ?ExpressionClause {
  if (oldName != null) {
    expressions = removeExpression(expressions, oldName);
  }
  return addExpression(expressions, name, expression);
}
export function removeExpression(
  expressions: ?ExpressionClause = {},
  name: ExpressionName,
): ?ExpressionClause {
  return _.omit(expressions, name);
}
export function clearExpressions(
  expressions: ?ExpressionClause,
): ?ExpressionClause {
  return {};
}
