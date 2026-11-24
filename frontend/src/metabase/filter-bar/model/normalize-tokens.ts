import { match } from "ts-pattern";

import { applyImplicitAnds } from "./implicit-and";
import { parseTokens } from "./parse-tokens";
import {
  type ParseError,
  type Token,
  type TokenStages,
  isAndToken,
  isCloseToken,
  isOpenToken,
  isOrToken,
} from "./types";
import { closeToken } from "./utils";

const removeAt = <F>(
  tokens: readonly Token<F>[],
  indexes: readonly number[],
): Token<F>[] => tokens.filter((_, index) => !indexes.includes(index));

const closeGroups = <F>(
  tokens: readonly Token<F>[],
  openIndex: number,
): Token<F>[] | null => {
  const groups: { hasAnd: boolean; hasOr: boolean; isAfterAnd: boolean }[] = [];
  tokens.slice(openIndex).forEach((token, offset) => {
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

  return [...tokens, ...groups.map(() => closeToken())];
};

const fixError = <F>(
  tokens: readonly Token<F>[],
  { code, indexes }: ParseError,
): Token<F>[] | null =>
  match(code)
    .with("missing-operand", "empty-parentheses", () =>
      removeAt(tokens, indexes),
    )
    .with("missing-closing-parenthesis", () => closeGroups(tokens, indexes[0]))
    .with("unexpected-closing-parenthesis", () => null)
    .exhaustive();

export const normalizeTokens = <F>(input: TokenStages<F>): TokenStages<F> => {
  const stages = applyImplicitAnds(input);
  const result = parseTokens(stages);
  if (result.type === "ok") {
    return stages;
  }
  const fixed = fixError(stages[result.stage], result);
  if (!fixed) {
    return stages;
  }
  return normalizeTokens(
    stages.map((tokens, stage) => (stage === result.stage ? fixed : tokens)),
  );
};
