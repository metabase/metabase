import _ from "underscore";

import type {
  ExpressionName,
  ExpressionClause,
  Expression,
} from "metabase-types/types/Query";

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

/**
 * Ensures expression's name uniqueness
 *
 * Example: if query has a "Double Total" expression,
 * and we're adding a new "Double Total" expression,
 * the second expression will be called "Double Total (1)",
 * the next one will be "Double Total (2)" and so on
 *
 * If the original name is already unique, the fn just returns it
 *
 * @param {string} originalName - expression's name
 * @param {object} expressions - object with existing query expressions
 * @returns {string}
 */
export function getUniqueExpressionName(expressions, originalName) {
  if (!expressions[originalName]) {
    return originalName;
  }
  const expressionNames = Object.keys(expressions);
  const handledDuplicateNamePattern = new RegExp(
    `^${originalName} \\([0-9]+\\)$`,
  );
  const duplicateNames = expressionNames.filter(
    name => name === originalName || handledDuplicateNamePattern.test(name),
  );
  return `${originalName} (${duplicateNames.length})`;
}
