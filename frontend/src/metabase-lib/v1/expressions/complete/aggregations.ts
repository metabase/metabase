import type { CompletionContext } from "@codemirror/autocomplete";

import type * as Lib from "metabase-lib";
import type Metadata from "metabase-lib/v1/metadata/Metadata";

import { AGGREGATION_FUNCTIONS, MBQL_CLAUSES } from "../config";
import { TOKEN } from "../tokenizer";

import {
  content,
  expressionClauseCompletion,
  fuzzyMatcher,
  getDatabase,
  isFieldReference,
  isIdentifier,
  tokenAtPos,
} from "./util";

export type Options = {
  query: Lib.Query;
  startRule: string;
  metadata: Metadata;
  reportTimezone?: string;
};

export function suggestAggregations({
  startRule,
  query,
  metadata,
  reportTimezone,
}: Options) {
  if (startRule !== "aggregation") {
    return null;
  }

  const database = getDatabase(query, metadata);
  const aggregations = Array.from(AGGREGATION_FUNCTIONS)
    .map(name => MBQL_CLAUSES[name])
    .filter(clause => clause && database?.hasFeature(clause.requiresFeature))
    .map(agg =>
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
    const options = matcher(content(source, token)).map(option => ({
      ...option,
      apply:
        next?.type === TOKEN.Operator && next.op === "("
          ? undefined
          : option.apply,
    }));

    return {
      from: token.start,
      to: token.end,
      options,
    };
  };
}
