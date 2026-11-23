import { match } from "ts-pattern";

import type { FilterTree } from "../types";

import type {
  NodeType,
  ParseError,
  ParseErrorCode,
  ParseResult,
  Token,
} from "./types";
import {
  PRECEDENCE,
  dropTrailingEmpty,
  emptyTree,
  isEmptyTree,
  splitByThen,
} from "./utils";

type StackItem = { type: NodeType | "open"; index: number };

type SegmentResult<F> = { type: "ok"; tree: FilterTree<F> } | ParseError;

const failure = (code: ParseErrorCode, ...indexes: number[]): ParseError => ({
  type: "error",
  code,
  indexes,
});

const join = <F>(
  type: NodeType,
  left: FilterTree<F>,
  right: FilterTree<F>,
): FilterTree<F> => ({
  type,
  children: [left, right].flatMap((child) =>
    child.type === type ? child.children : [child],
  ),
});

// Shunting-yard that builds the tree right away instead of reverse Polish
// notation, and stops at the first token out of place.
const parseSegment = <F>(tokens: readonly Token<F>[]): SegmentResult<F> => {
  const output: FilterTree<F>[] = [];
  const stack: StackItem[] = [];
  let expectsOperand = true;

  const popOperators = (shouldPop: (type: NodeType) => boolean) => {
    let top = stack.at(-1);
    while (top && top.type !== "open" && shouldPop(top.type)) {
      stack.pop();
      const right = output.pop();
      const left = output.pop();
      if (left && right) {
        output.push(join(top.type, left, right));
      }
      top = stack.at(-1);
    }
  };

  for (const [index, token] of tokens.entries()) {
    const error = match(token)
      .with({ type: "pill" }, ({ filter }) => {
        if (!expectsOperand) {
          return failure("missing-connector", index - 1, index);
        }
        output.push({ type: "leaf", filter });
        expectsOperand = false;
        return null;
      })
      .with({ type: "open" }, () => {
        if (!expectsOperand) {
          return failure("missing-connector", index - 1, index);
        }
        stack.push({ type: "open", index });
        return null;
      })
      .with({ type: "and" }, { type: "or" }, ({ type }) => {
        if (expectsOperand) {
          return failure("missing-filter", index);
        }
        popOperators((top) => PRECEDENCE[top] >= PRECEDENCE[type]);
        stack.push({ type, index });
        expectsOperand = true;
        return null;
      })
      .with({ type: "close" }, () => {
        const previous = tokens[index - 1];
        if (previous?.type === "open") {
          return failure("empty-parentheses", index - 1, index);
        }
        if (expectsOperand) {
          return previous
            ? failure("missing-filter", index - 1)
            : failure("unexpected-closing-parenthesis", index);
        }
        popOperators(() => true);
        if (stack.pop()?.type !== "open") {
          return failure("unexpected-closing-parenthesis", index);
        }
        return null;
      })
      .with({ type: "then" }, () => null)
      .exhaustive();

    if (error) {
      return error;
    }
  }

  if (expectsOperand && tokens.length > 0) {
    return failure("missing-filter", tokens.length - 1);
  }
  popOperators(() => true);
  const unclosed = stack.find((item) => item.type === "open");
  if (unclosed) {
    return failure("missing-closing-parenthesis", unclosed.index);
  }

  return { type: "ok", tree: output[0] ?? emptyTree() };
};

export const parseTokens = <F>(tokens: readonly Token<F>[]): ParseResult<F> => {
  const stages: FilterTree<F>[] = [];
  let offset = 0;

  for (const segment of splitByThen(tokens)) {
    const result = parseSegment(segment);
    if (result.type === "error") {
      return {
        ...result,
        indexes: result.indexes.map((index) => index + offset),
      };
    }
    stages.push(result.tree);
    offset += segment.length + 1;
  }

  return { type: "ok", stages: dropTrailingEmpty(stages, isEmptyTree) };
};
