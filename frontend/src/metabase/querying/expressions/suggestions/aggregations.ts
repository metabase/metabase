import type { CompletionContext } from "@codemirror/autocomplete";

import type * as Lib from "metabase-lib";
import type Metadata from "metabase-lib/v1/metadata/Metadata";

import { getSupportedClauses } from "../clause";
import { tokenAtPos } from "../position";
import { GROUP } from "../pratt";
import { getDatabase } from "../utils";

import {
  expressionClauseCompletion,
  fuzzyMatcher,
  isFieldReference,
  isIdentifier,
} from "./util";

export type Options = {
  query: Lib.Query;
  expressionMode: Lib.ExpressionMode;
  metadata: Metadata;
};

export function suggestAggregations({
  expressionMode,
  query,
  metadata,
}: Options) {
  if (expressionMode !== "aggregation") {
    return null;
  }

  const database = getDatabase(query, metadata);
  const aggregations = getSupportedClauses({ expressionMode, database }).map(
    (agg) => expressionClauseCompletion(agg, { type: "aggregation" }),
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
    const options = matcher(token.text).map((option) => ({
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
