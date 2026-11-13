import { snippetCompletion } from "@codemirror/autocomplete";

import type * as Lib from "metabase-lib";

import { CALL, FIELD, IDENTIFIER, type Token } from "../pratt";

import { FUNCTION_ALIASES } from "./aliases";
import { withPlaceholders } from "./placeholders";
import { matchOptions } from "./text-match";
import type { ExpressionSuggestion } from "./types";

export function expressionClauseCompletion(
  clause: Lib.MBQLClauseFunctionConfig,
  {
    type,
    matches,
  }: {
    type: string;
    matches?: [number, number][];
  },
): ExpressionSuggestion {
  const template = expressionClauseSnippet(clause);
  const completion = withPlaceholders(
    snippetCompletion(template, {
      type,
      label: clause.displayName,
      displayLabel: clause.displayName,
    }),
    template,
  );
  return {
    ...completion,
    icon: "function",
    clauseName: clause.name,
    matches,
    aliases: FUNCTION_ALIASES[clause.name],
  };
}

export function expressionClauseSnippet(clause: Lib.MBQLClauseFunctionConfig) {
  const args =
    clause.args
      .filter((arg) => arg.name !== "…")
      .map((arg) => "${" + (arg.template ?? arg.name) + "}")
      .join(", ") ?? "";

  return `${clause.displayName}(${args})`;
}

export function fuzzyMatcher(options: ExpressionSuggestion[]) {
  return function (word: string) {
    return matchOptions(options, word);
  };
}

export function isIdentifier(token: Token | null) {
  return token != null && (token.type === IDENTIFIER || token.type === CALL);
}

export function isFieldReference(token: Token | null) {
  return token != null && token.type === FIELD;
}
