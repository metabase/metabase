import { P, match } from "ts-pattern";

import type { FilterTree } from "../types";

import {
  type BoolOpToken,
  type OpenToken,
  type ParseError,
  type ParseErrorCode,
  type ParseResult,
  type Token,
  type TokenStages,
  applyImplicitAnds,
  boolOpToken,
  closeToken,
  isAndToken,
  isBoolOpToken,
  isCloseToken,
  isOpenToken,
  isOrToken,
  isPillToken,
  openToken,
} from "./tokens";
import { type BoolOp, PRECEDENCE, emptyTree } from "./tree";

type StackItem = (OpenToken | BoolOpToken) & { index: number };

type StageError = Omit<ParseError, "stageIndex">;

type StageResult<F> = { type: "ok"; tree: FilterTree<F> } | StageError;

const failure = (code: ParseErrorCode, ...indexes: number[]): StageError => ({
  type: "error",
  code,
  indexes,
});

const join = <F>(
  type: BoolOp,
  left: FilterTree<F>,
  right: FilterTree<F>,
): FilterTree<F> => ({
  type,
  children: [left, right].flatMap((child) =>
    child.type === type ? child.children : [child],
  ),
});

// Shunting-yard that builds the tree right away instead of reverse Polish
// notation, and stops at the first token out of place. Operands side by side
// get an implicit `and`, like implicit multiplication in `2x`.
const parseStage = <F>(tokens: readonly Token<F>[]): StageResult<F> => {
  const output: FilterTree<F>[] = [];
  const stack: StackItem[] = [];
  let expectsOperand = true;

  const popOperators = (shouldPop: (type: BoolOp) => boolean) => {
    let top = stack.at(-1);
    while (top && !isOpenToken(top) && shouldPop(top.type)) {
      stack.pop();
      const right = output.pop();
      const left = output.pop();
      if (left && right) {
        output.push(join(top.type, left, right));
      }
      top = stack.at(-1);
    }
  };

  const pushBoolOp = (type: BoolOp, index: number) => {
    popOperators((top) => PRECEDENCE[top] >= PRECEDENCE[type]);
    stack.push({ ...boolOpToken(type), index });
    expectsOperand = true;
  };

  const addImplicitAnd = (index: number) => {
    if (!expectsOperand) {
      pushBoolOp("and", index);
    }
  };

  for (const [index, token] of tokens.entries()) {
    const error = match(token)
      .with(P.when(isPillToken), ({ filter }) => {
        addImplicitAnd(index);
        output.push({ type: "leaf", filter });
        expectsOperand = false;
        return null;
      })
      .with(P.when(isOpenToken), () => {
        addImplicitAnd(index);
        stack.push({ ...openToken(), index });
        return null;
      })
      .with(P.when(isBoolOpToken), ({ type }) => {
        if (expectsOperand) {
          return failure("missing-operand", index);
        }
        pushBoolOp(type, index);
        return null;
      })
      .with(P.when(isCloseToken), () => {
        const previous = tokens[index - 1];
        if (isOpenToken(previous)) {
          return failure("empty-parentheses", index - 1, index);
        }
        if (expectsOperand) {
          return previous
            ? failure("missing-operand", index - 1)
            : failure("unexpected-closing-parenthesis", index);
        }
        popOperators(() => true);
        if (!isOpenToken(stack.pop())) {
          return failure("unexpected-closing-parenthesis", index);
        }
        return null;
      })
      .exhaustive();

    if (error) {
      return error;
    }
  }

  if (expectsOperand && tokens.length > 0) {
    return failure("missing-operand", tokens.length - 1);
  }
  popOperators(() => true);
  const unclosed = stack.find(isOpenToken);
  if (unclosed) {
    return failure("missing-closing-parenthesis", unclosed.index);
  }

  return { type: "ok", tree: output[0] ?? emptyTree() };
};

export const tokensToTrees = <F>(tokens: TokenStages<F>): ParseResult<F> => {
  const results = tokens.map(parseStage);
  const [error] = results.flatMap((result, stage) =>
    result.type === "error" ? [{ ...result, stageIndex: stage }] : [],
  );
  if (error) {
    return error;
  }
  return {
    type: "ok",
    stages: results.flatMap((result) =>
      result.type === "ok" ? [result.tree] : [],
    ),
  };
};

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
  const result = tokensToTrees(stages);
  if (result.type === "ok") {
    return stages;
  }
  const fixed = fixError(stages[result.stageIndex], result);
  if (!fixed) {
    return stages;
  }
  return normalizeTokens(
    stages.map((tokens, stage) =>
      stage === result.stageIndex ? fixed : tokens,
    ),
  );
};
