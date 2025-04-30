import type { CompletionContext } from "@codemirror/autocomplete";

import { isNotNull } from "metabase/lib/types";
import type * as Lib from "metabase-lib";
import type Metadata from "metabase-lib/v1/metadata/Metadata";

import { getClauseDefinition } from "../clause";
import { AGGREGATION_FUNCTIONS } from "../config";
import { GROUP } from "../pratt";
import { getDatabase } from "../utils";

import {
  content,
  expressionClauseCompletion,
  fuzzyMatcher,
  isFieldReference,
  isIdentifier,
  tokenAtPos,
} from "./util";

export type Options = {
  query: Lib.Query;
  expressionMode: Lib.ExpressionMode;
  metadata: Metadata;
  reportTimezone?: string;
};

export function suggestAggregations({
  expressionMode,
  query,
  metadata,
  reportTimezone,
}: Options) {
  if (expressionMode !== "aggregation") {
    return null;
  }

  const database = getDatabase(query, metadata);
  const aggregations = Object.keys(AGGREGATION_FUNCTIONS)
    .map(getClauseDefinition)
    .filter(isNotNull)
    .filter((clause) => database?.hasFeature(clause.requiresFeature))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((agg) =>
      expressionClauseCompletion(agg, {
        type: "aggregation",
        database,
        reportTimezone,
      }),
    );

  const matcher = fuzzyMatcher(aggregations);

  return function (context: CompletionContext) {
    const source = context.state.doc.toString();
    const token = tokenAtPos(source, context.pos);
    if (!token || !isIdentifier(token) || isFieldReference(token)) {
      // Cursor is inside a field reference tag
      return null;
    }

    // do not expand template if the next token is a (
    const next = tokenAtPos(source, token.end + 1);
    const options = matcher(content(source, token)).map((option) => ({
      ...option,
      apply: next?.type === GROUP ? undefined : option.apply,
    }));

    return {
      from: token.start,
      to: token.end,
      options,
    };
  };
}
