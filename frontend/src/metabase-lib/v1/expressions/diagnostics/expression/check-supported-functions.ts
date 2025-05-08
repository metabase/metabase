import { t } from "ttag";

import * as Lib from "metabase-lib";
import type Metadata from "metabase-lib/v1/metadata/Metadata";

import { getClauseDefinition } from "../../clause";
import { getDatabase } from "../../utils";
import { visit } from "../../visitor";
import { error } from "../utils";

export function checkSupportedFunctions({
  expressionParts,
  query,
  metadata,
}: {
  expressionParts: Lib.ExpressionParts | Lib.ExpressionArg;
  query: Lib.Query;
  metadata?: Metadata;
}) {
  if (!metadata) {
    return;
  }

  const database = getDatabase(query, metadata);
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
    if (!database?.hasFeature(clause.requiresFeature)) {
      error(node, t`Unsupported function ${operator}`);
    }
  });
}
