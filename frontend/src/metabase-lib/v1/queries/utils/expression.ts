import { unique_expression_name } from "cljs/metabase.xrays.domain_entities.queries.util";
import type { ExpressionClause } from "metabase-types/api";

/**
 * Ensures expression's name uniqueness
 *
 * Example: if query has a "Double Total" expression,
 * and we're adding a new "Double Total" expression,
 * the second expression will be called "Double Total (1)",
 * the next one will be "Double Total (2)" and so on
 *
 * If the original name is already unique, the fn just returns it
 */
export function getUniqueExpressionName(
  expressions: ExpressionClause,
  originalName: string,
): string {
  return unique_expression_name(expressions, originalName);
}
