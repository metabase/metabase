import { snippetCompletion } from "@codemirror/autocomplete";
import Fuse from "fuse.js";

import { CALL, FIELD, IDENTIFIER, type Token } from "../pratt";
import type { MBQLClauseFunctionConfig } from "../types";

import type { ExpressionSuggestion } from "./types";

export function expressionClauseCompletion(
  clause: MBQLClauseFunctionConfig,
  {
    type,
    matches,
  }: {
    type: string;
    matches?: [number, number][];
  },
): ExpressionSuggestion {
  const completion = snippetCompletion(expressionClauseSnippet(clause), {
    type,
    label: clause.displayName,
    displayLabel: clause.displayName,
  });
  return { ...completion, icon: "function", matches };
}

export function expressionClauseSnippet(clause: MBQLClauseFunctionConfig) {
  const args =
    clause.args
      .filter((arg) => arg.name !== "…")
      .map((arg) => "${" + (arg.template ?? arg.name) + "}")
      .join(", ") ?? "";

  return `${clause.displayName}(${args})`;
}

export function fuzzyMatcher(options: ExpressionSuggestion[]) {
  const fuse = new Fuse(options, {
    keys: ["displayLabel"],
    includeScore: true,
    includeMatches: true,
  });

  return function (word: string) {
    return fuse
      .search(word)
      .sort((a, b) => (a.score ?? 0) - (b.score ?? 0))
      .map((result) => {
        result.item.matches =
          result.matches?.flatMap((match) => match.indices) ?? [];
        return result.item;
      });
  };
}

export function isIdentifier(token: Token | null) {
  return token != null && (token.type === IDENTIFIER || token.type === CALL);
}

export function isFieldReference(token: Token | null) {
  return token != null && token.type === FIELD;
}
