import type { CompletionContext } from "@codemirror/autocomplete";

import type * as Lib from "metabase-lib";
import type Metadata from "metabase-lib/v1/metadata/Metadata";

import { EXPRESSION_FUNCTIONS, MBQL_CLAUSES } from "../config";
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
  startRule: string;
  query: Lib.Query;
  metadata: Metadata;
  reportTimezone?: string;
};

export function suggestFunctions({
  startRule,
  query,
  metadata,
  reportTimezone,
}: Options) {
  if (startRule !== "expression" && startRule !== "boolean") {
    return null;
  }

  const database = getDatabase(query, metadata);
  const ALIASES = ["case"];
  const functions = [...EXPRESSION_FUNCTIONS, ...ALIASES]
    .map(name => MBQL_CLAUSES[name])
    .filter(clause => clause && database?.hasFeature(clause.requiresFeature))
    .filter(function disableOffsetInFilterExpressions(clause) {
      const isOffset = clause.name === "offset";
      const isFilterExpression = startRule === "boolean";
      const isOffsetInFilterExpression = isOffset && isFilterExpression;
      return !isOffsetInFilterExpression;
    })
    .map(func =>
      expressionClauseCompletion(func, {
        type: "function",
        database,
        reportTimezone,
      }),
    );

  const matcher = fuzzyMatcher(functions);

  return function (context: CompletionContext) {
    const source = context.state.doc.toString();
    const token = tokenAtPos(source, context.pos);

    if (!token || !isIdentifier(token) || isFieldReference(token)) {
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
