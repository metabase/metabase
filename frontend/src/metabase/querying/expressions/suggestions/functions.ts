import type { CompletionContext } from "@codemirror/autocomplete";

import type * as Lib from "metabase-lib";
import type { Database } from "metabase-types/api";

import { getSupportedClauses } from "../clause";
import { tokenAtPos } from "../position";
import {
  GROUP,
  LOGICAL_AND,
  LOGICAL_NOT,
  LOGICAL_OR,
  type Token,
} from "../pratt";

import {
  expressionClauseCompletion,
  fuzzyMatcher,
  isFieldReference,
  isIdentifier,
} from "./util";

export type Options = {
  expressionMode: Lib.ExpressionMode;
  database: Pick<Database, "features"> | undefined;
};

export function suggestFunctions({ expressionMode, database }: Options) {
  if (expressionMode !== "expression" && expressionMode !== "filter") {
    return null;
  }

  const functions = getSupportedClauses({ expressionMode, database }).map(
    (func) => expressionClauseCompletion(func, { type: "function" }),
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

const PREFIX_OPERATORS = new Set([LOGICAL_OR, LOGICAL_AND, LOGICAL_NOT]);

function isPotentialFunctionPrefix(token: Token) {
  return isIdentifier(token) || PREFIX_OPERATORS.has(token.type);
}
