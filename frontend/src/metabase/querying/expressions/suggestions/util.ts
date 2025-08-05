import { snippetCompletion } from "@codemirror/autocomplete";
import Fuse from "fuse.js";
import _ from "underscore";

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

export const fuzzyMatcher = _.memoize(function ({
  options,
  keys = ["displayLabel"],
}: {
  options: ExpressionSuggestion[];
  keys?: (string | { name: string; weight?: number })[];
}) {
  const fuse = new Fuse(options, {
    keys,
    includeScore: true,
    includeMatches: true,
  });

  return function (word: string) {
    return fuse
      .search(word)
      .filter((result) => (result.score ?? 0) <= 0.6)
      .sort((a, b) => (a.score ?? 0) - (b.score ?? 0))
      .map((result) => {
        const { item, matches = [] } = result;
        const key = matches[0]?.key;
        const indices = matches[0]?.indices;

        // We need to preserve item identity here, so we need to return the original item
        // possible with updated values for displayLabel and matches
        // item.displayLabel = displayLabel ?? item.displayLabel;
        if (key === "displayLabel") {
          item.matches = Array.from(indices ?? []);
        }

        return item;
      });
  };
}, JSON.stringify);

export function isIdentifier(token: Token | null) {
  return token != null && (token.type === IDENTIFIER || token.type === CALL);
}

export function isFieldReference(token: Token | null) {
  return token != null && token.type === FIELD;
}
