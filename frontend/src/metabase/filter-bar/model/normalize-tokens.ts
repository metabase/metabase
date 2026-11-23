import { match } from "ts-pattern";

import { parseTokens } from "./parse-tokens";
import type { ParseError, Token } from "./types";
import { dropTrailingEmpty, joinTokens, splitByThen } from "./utils";

const removeAt = <F>(
  tokens: readonly Token<F>[],
  indexes: readonly number[],
): Token<F>[] => tokens.filter((_, index) => !indexes.includes(index));

const insertAndAt = <F>(
  tokens: readonly Token<F>[],
  index: number,
): Token<F>[] => [
  ...tokens.slice(0, index),
  { type: "and" },
  ...tokens.slice(index),
];

const closeGroups = <F>(
  tokens: readonly Token<F>[],
  openIndex: number,
): Token<F>[] | null => {
  const thenIndex = tokens.findIndex(
    (token, index) => index > openIndex && token.type === "then",
  );
  const end = thenIndex === -1 ? tokens.length : thenIndex;

  const groups: { hasAnd: boolean; hasOr: boolean; isAfterAnd: boolean }[] = [];
  tokens.slice(openIndex, end).forEach((token, offset) => {
    const group = groups.at(-1);
    if (token.type === "open") {
      const isAfterAnd = tokens[openIndex + offset - 1]?.type === "and";
      groups.push({ hasAnd: false, hasOr: false, isAfterAnd });
    }
    if (token.type === "close") {
      groups.pop();
    }
    if (token.type === "and" && group) {
      group.hasAnd = true;
    }
    if (token.type === "or" && group) {
      group.hasOr = true;
    }
  });

  const isAmbiguous = groups.some(
    ({ hasAnd, hasOr, isAfterAnd }) => hasOr && (hasAnd || isAfterAnd),
  );
  if (isAmbiguous) {
    return null;
  }

  return [
    ...tokens.slice(0, end),
    ...groups.map((): Token<F> => ({ type: "close" })),
    ...tokens.slice(end),
  ];
};

const fixError = <F>(
  tokens: readonly Token<F>[],
  { code, indexes }: ParseError,
): Token<F>[] | null =>
  match(code)
    .with("missing-filter", "empty-parentheses", () =>
      removeAt(tokens, indexes),
    )
    .with("missing-connector", () => insertAndAt(tokens, indexes[1]))
    .with("missing-closing-parenthesis", () => closeGroups(tokens, indexes[0]))
    .with("unexpected-closing-parenthesis", () => null)
    .exhaustive();

const dropTrailingThens = <F>(tokens: readonly Token<F>[]): Token<F>[] =>
  joinTokens(
    dropTrailingEmpty(splitByThen(tokens), (segment) => segment.length === 0),
    { type: "then" },
  );

export const normalizeTokens = <F>(
  tokens: readonly Token<F>[],
): readonly Token<F>[] => {
  const result = parseTokens(tokens);
  if (result.type === "ok") {
    return dropTrailingThens(tokens);
  }
  const fixed = fixError(tokens, result);
  return fixed ? normalizeTokens(fixed) : tokens;
};
