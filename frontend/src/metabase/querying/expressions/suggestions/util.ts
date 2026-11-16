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

/**
 * A function with a placeholder for each value it needs, like
 * `datetimeDiff(${datetime1}, ${datetime2}, ${unit})${}`. Optional values are
 * left out; a comma after the last value adds them. The empty stop at the end
 * is where Tab goes after the last value, after the parentheses.
 */
export function expressionClauseSnippet(clause: Lib.MBQLClauseFunctionConfig) {
  const args = clause.args
    .filter((arg) => arg.name !== "…" && !arg.optional)
    .map((arg) => "${" + (arg.template ?? arg.name) + "}");

  const call = `${clause.displayName}(${args.join(", ")})`;
  return args.length > 0 ? `${call}\${}` : call;
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
