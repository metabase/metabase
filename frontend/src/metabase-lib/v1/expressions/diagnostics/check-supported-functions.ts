import { t } from "ttag";

import * as Lib from "metabase-lib";
import type Metadata from "metabase-lib/v1/metadata/Metadata";

import { getClauseDefinition } from "../config";
import { DiagnosticError } from "../errors";
import { getDatabase, getToken } from "../utils";
import { visit } from "../visitor";

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
      throw new DiagnosticError(
        t`Unsupported function ${operator}`,
        getToken(node),
      );
    }
  });
}
