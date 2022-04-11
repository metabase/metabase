import _ from "underscore";

export function getExpressions(expressions = {}) {
  return expressions;
}

export function getExpressionsList(expressions = {}) {
  return Object.entries(expressions).map(([name, expression]) => ({
    name,
    expression,
  }));
}

export function addExpression(expressions = {}, name, expression) {
  return { ...expressions, [name]: expression };
}
export function updateExpression(expressions = {}, name, expression, oldName) {
  if (oldName != null) {
    expressions = removeExpression(expressions, oldName);
  }
  return addExpression(expressions, name, expression);
}
export function removeExpression(expressions = {}, name) {
  return _.omit(expressions, name);
}
export function clearExpressions(expressions) {
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
  return getUniqueName(duplicateNames, originalName, duplicateNames.length);
}

function getUniqueName(expressionNames, originalName, index) {
  const nameWithIndexAppended = `${originalName} (${index})`;
  const isUnique = !expressionNames.includes(nameWithIndexAppended);
  return isUnique
    ? nameWithIndexAppended
    : getUniqueName(expressionNames, originalName, index + 1);
}
