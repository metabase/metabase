import { t } from "ttag";

import { hasRequiredFeature } from "metabase/databases";
import * as Lib from "metabase-lib";
import type { Database } from "metabase-types/api";

import { getClauseDefinition } from "../../clause";
import { visit } from "../../visitor";
import { error } from "../utils";

export function checkSupportedFunctions({
  expressionParts,
  database,
}: {
  expressionParts: Lib.ExpressionParts | Lib.ExpressionArg;
  database?: Pick<Database, "features">;
}) {
  if (!database) {
    return;
  }

  visit(expressionParts, (node) => {
    if (!Lib.isExpressionParts(node)) {
      return;
    }
    const { operator } = node;
    const clause = getClauseDefinition(operator);
    if (!clause) {
      return;
    }
    if (
      database == null ||
      !hasRequiredFeature(database, clause.requiresFeature)
    ) {
      error(node, t`Unsupported function ${clause.displayName}`);
    }
  });
}
