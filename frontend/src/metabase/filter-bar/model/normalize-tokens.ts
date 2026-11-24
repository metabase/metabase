import { match } from "ts-pattern";

import { parseTokens } from "./parse-tokens";
import {
  type ParseError,
  type Token,
  isAndToken,
  isCloseToken,
  isOpenToken,
  isOrToken,
  isThenToken,
} from "./types";
import { closeToken, connectorToken } from "./utils";

const removeAt = <F>(
  tokens: readonly Token<F>[],
  indexes: readonly number[],
): Token<F>[] => tokens.filter((_, index) => !indexes.includes(index));

const insertAndAt = <F>(
  tokens: readonly Token<F>[],
  index: number,
): Token<F>[] => [
  ...tokens.slice(0, index),
  connectorToken("and"),
  ...tokens.slice(index),
];

const closeGroups = <F>(
  tokens: readonly Token<F>[],
  openIndex: number,
): Token<F>[] | null => {
  const thenIndex = tokens.findIndex(
    (token, index) => index > openIndex && isThenToken(token),
  );
  const end = thenIndex === -1 ? tokens.length : thenIndex;

  const groups: { hasAnd: boolean; hasOr: boolean; isAfterAnd: boolean }[] = [];
  tokens.slice(openIndex, end).forEach((token, offset) => {
    const group = groups.at(-1);
    if (isOpenToken(token)) {
      const isAfterAnd = isAndToken(tokens[openIndex + offset - 1]);
      groups.push({ hasAnd: false, hasOr: false, isAfterAnd });
    }
    if (isCloseToken(token)) {
      groups.pop();
    }
    if (isAndToken(token) && group) {
      group.hasAnd = true;
    }
    if (isOrToken(token) && group) {
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
    ...groups.map(() => closeToken<F>()),
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

const dropDanglingThens = <F>(tokens: readonly Token<F>[]): Token<F>[] =>
  tokens.filter((token, index) => {
    const next = tokens[index + 1];
    const isEmptyStage = next === undefined || isThenToken(next);
    return !isThenToken(token) || !isEmptyStage;
  });

export const normalizeTokens = <F>(
  tokens: readonly Token<F>[],
): readonly Token<F>[] => {
  const result = parseTokens(tokens);
  if (result.type === "ok") {
    return dropDanglingThens(tokens);
  }
  const fixed = fixError(tokens, result);
  return fixed ? normalizeTokens(fixed) : tokens;
};
