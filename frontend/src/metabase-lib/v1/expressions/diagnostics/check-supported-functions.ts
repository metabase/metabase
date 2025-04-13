import { t } from "ttag";

import type * as Lib from "metabase-lib";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import type { Expression } from "metabase-types/api";

import { getClauseDefinition } from "../config";
import { DiagnosticError } from "../errors";
import { isCallExpression } from "../matchers";
import { getDatabase, getToken } from "../utils";
import { visit } from "../visitor";

export function checkSupportedFunctions({
  query,
  expression,
  metadata,
}: {
  expression: Expression;
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

  visit(expression, (node) => {
    if (!isCallExpression(node)) {
      return;
    }
    const [name] = node;
    const clause = getClauseDefinition(name);
    if (!clause) {
      return;
    }
    if (!database?.hasFeature(clause.requiresFeature)) {
      throw new DiagnosticError(
        t`Unsupported function ${name}`,
        getToken(node),
      );
    }
  });
}
