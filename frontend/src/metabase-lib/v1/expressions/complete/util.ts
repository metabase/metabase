import { snippetCompletion } from "@codemirror/autocomplete";
import Fuse from "fuse.js";
import _ from "underscore";

import {
  CALL,
  END_OF_INPUT,
  FIELD,
  IDENTIFIER,
  STRING,
  type Token,
  lexify,
} from "../pratt";
import type { MBQLClauseFunctionConfig } from "../types";

import type { Completion } from "./types";

export function expressionClauseCompletion(
  clause: MBQLClauseFunctionConfig,
  {
    type,
    matches,
  }: {
    type: string;
    matches?: [number, number][];
  },
): Completion {
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
  options: Completion[];
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

export function tokenAtPos(source: string, pos: number): Token | null {
  const tokens = lexify(source);

  const idx = tokens.findIndex(
    (token) => token.start <= pos && token.end >= pos,
  );
  if (idx === -1) {
    return null;
  }

  const token = tokens[idx];
  const prevToken = tokens[idx - 1];

  if (token.type === END_OF_INPUT) {
    return null;
  }

  if (prevToken && prevToken.type === STRING && prevToken.length === 1) {
    // dangling single- or double-quote
    return null;
  }

  return token;
}

export function content(source: string, token: Token): string {
  return source.slice(token.pos, token.pos + token.length);
}

export function isIdentifier(token: Token | null) {
  return token != null && (token.type === IDENTIFIER || token.type === CALL);
}

export function isFieldReference(token: Token | null) {
  return token != null && token.type === FIELD;
}
