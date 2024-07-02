import { unique_expression_name } from "cljs/metabase.xrays.domain_entities.queries.util";

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
  return unique_expression_name(expressions, originalName);
}
