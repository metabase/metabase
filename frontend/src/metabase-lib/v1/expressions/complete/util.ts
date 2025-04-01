import { snippetCompletion } from "@codemirror/autocomplete";
import Fuse from "fuse.js";

import type Database from "metabase-lib/v1/metadata/Database";

import { getHelpText } from "../helper-text-strings";
import {
  CALL,
  END_OF_INPUT,
  FIELD,
  IDENTIFIER,
  OPERATORS,
  STRING,
  type Token,
  lexify,
} from "../pratt";
import type { HelpText, MBQLClauseFunctionConfig } from "../types";

import type { Completion } from "./types";

export function expressionClauseCompletion(
  clause: MBQLClauseFunctionConfig,
  {
    type,
    database,
    reportTimezone,
    matches,
  }: {
    type: string;
    database: Database | null;
    reportTimezone?: string;
    matches?: [number, number][];
  },
): Completion {
  const helpText =
    clause.name &&
    database &&
    getHelpText(clause.name, database, reportTimezone);

  if (helpText) {
    const completion = snippetCompletion(getSnippet(helpText), {
      type,
      label: clause.displayName,
      displayLabel: clause.displayName,
      detail: helpText.description,
    });
    return { ...completion, icon: "function", matches };
  }

  return {
    type,
    label: suggestionText(clause),
    displayLabel: clause.displayName,
    icon: "function",
    matches,
  };
}

const suggestionText = (func: MBQLClauseFunctionConfig) => {
  const { displayName, args } = func;
  const suffix = args.length > 0 ? "(" : " ";
  return displayName + suffix;
};

function getSnippet(helpText: HelpText) {
  const args = helpText.args
    ?.filter((arg) => arg.name !== "…")
    ?.map((arg) => "${" + (arg.template ?? arg.name) + "}")
    .join(", ");

  if (!args || args.length < 1) {
    return `${helpText.structure}`;
  }
  return `${helpText.structure}(${args})`;
}

export function fuzzyMatcher(options: Completion[]) {
  const keys = ["displayLabel"];

  const fuse = new Fuse(options, {
    keys,
    includeScore: true,
    includeMatches: true,
  });

  return function (word: string) {
    return (
      fuse
        .search(word)
        // .filter(result => (result.score ?? 0) <= 1)
        .sort((a, b) => (a.score ?? 0) - (b.score ?? 0))
        .map((result) => {
          result.item.matches =
            result.matches?.flatMap((match) => match.indices) ?? [];
          return result.item;
        })
    );
  };
}

export function tokenAtPos(source: string, pos: number): Token | null {
  const { tokens } = lexify(source);

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

export function isOperator(token: Token | null) {
  return token != null && OPERATORS.has(token.type);
}

export function isFieldReference(token: Token | null) {
  return token != null && token.type === FIELD;
}
