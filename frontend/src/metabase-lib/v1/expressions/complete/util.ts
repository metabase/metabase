import { snippetCompletion } from "@codemirror/autocomplete";
import Fuse from "fuse.js";

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

export function fuzzyMatcher(
  options: Completion[],
  {
    keys = ["displayLabel"],
  }: {
    keys?: (string | { name: string; weight?: number })[];
  } = {},
) {
  const fuse = new Fuse(options, {
    keys,
    includeScore: true,
    includeMatches: true,
  });

  return function (word: string) {
    return fuse
      .search(word)
      .filter((result) => (result.score ?? 0) <= 0.5)
      .sort((a, b) => (a.score ?? 0) - (b.score ?? 0))
      .map((result) => {
        const key = result.matches?.[0]?.key;
        const matches = result.matches?.flatMap((match) =>
          match.key === key ? (match.indices ?? []) : [],
        );

        const displayLabel = key
          ? (result.item[key as keyof typeof result.item] as string | undefined)
          : null;

        return {
          ...result.item,
          displayLabel: displayLabel ?? result.item.displayLabel,
          matches,
        };
      });
  };
}

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
