import { P, match } from "ts-pattern";

import type { FilterTree } from "../types";

import {
  type ConnectorToken,
  type NodeType,
  type OpenToken,
  type ParseError,
  type ParseErrorCode,
  type ParseResult,
  type Token,
  type TokenStages,
  isCloseToken,
  isConnectorToken,
  isOpenToken,
  isPillToken,
} from "./types";
import { PRECEDENCE, connectorToken, emptyTree, openToken } from "./utils";

type StackItem = (OpenToken | ConnectorToken) & { index: number };

type SegmentError = Omit<ParseError, "stage">;

type SegmentResult<F> = { type: "ok"; tree: FilterTree<F> } | SegmentError;

const failure = (code: ParseErrorCode, ...indexes: number[]): SegmentError => ({
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
// notation, and stops at the first token out of place. Operands side by side
// get an implicit `and`, like implicit multiplication in `2x`.
const parseSegment = <F>(tokens: readonly Token<F>[]): SegmentResult<F> => {
  const output: FilterTree<F>[] = [];
  const stack: StackItem[] = [];
  let expectsOperand = true;

  const popOperators = (shouldPop: (type: NodeType) => boolean) => {
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

  const pushConnector = (type: NodeType, index: number) => {
    popOperators((top) => PRECEDENCE[top] >= PRECEDENCE[type]);
    stack.push({ ...connectorToken(type), index });
    expectsOperand = true;
  };

  const addImplicitAnd = (index: number) => {
    if (!expectsOperand) {
      pushConnector("and", index);
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
      .with(P.when(isConnectorToken), ({ type }) => {
        if (expectsOperand) {
          return failure("missing-operand", index);
        }
        pushConnector(type, index);
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

export const parseTokens = <F>(stages: TokenStages<F>): ParseResult<F> => {
  const results = stages.map(parseSegment);
  const [error] = results.flatMap((result, stage) =>
    result.type === "error" ? [{ ...result, stage }] : [],
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
