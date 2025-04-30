import type { CompletionContext } from "@codemirror/autocomplete";

import { isNotNull } from "metabase/lib/types";
import type * as Lib from "metabase-lib";
import type Metadata from "metabase-lib/v1/metadata/Metadata";

import { getClauseDefinition } from "../clause";
import { EXPRESSION_FUNCTIONS } from "../config";
import {
  GROUP,
  LOGICAL_AND,
  LOGICAL_NOT,
  LOGICAL_OR,
  type Token,
} from "../pratt";
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
  expressionMode: Lib.ExpressionMode;
  query: Lib.Query;
  metadata: Metadata;
  reportTimezone?: string;
};

export function suggestFunctions({
  expressionMode,
  query,
  metadata,
  reportTimezone,
}: Options) {
  if (expressionMode !== "expression" && expressionMode !== "filter") {
    return null;
  }

  const database = getDatabase(query, metadata);
  const functions = Object.keys(EXPRESSION_FUNCTIONS)
    .map(getClauseDefinition)
    .filter(isNotNull)
    .filter((clause) => database?.hasFeature(clause.requiresFeature))
    .filter(function disableOffsetInFilterExpressions(clause) {
      const isOffset = clause.name === "offset";
      const isFilterExpression = expressionMode === "filter";
      const isOffsetInFilterExpression = isOffset && isFilterExpression;
      return !isOffsetInFilterExpression;
    })
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((func) =>
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

    if (
      !token ||
      !isPotentialFunctionPrefix(token) ||
      isFieldReference(token)
    ) {
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

const PREFIX_OPERATORS = new Set([LOGICAL_OR, LOGICAL_AND, LOGICAL_NOT]);

function isPotentialFunctionPrefix(token: Token) {
  return isIdentifier(token) || PREFIX_OPERATORS.has(token.type);
}
