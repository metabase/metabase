import type { ExpressionRef, MathOperator } from "metabase-types/api";

import type { ExpressionSubToken } from "../types/viewer-state";

type ParseCtx = {
  tokens: ExpressionSubToken[];
  pos: number;
  leafRefs: Map<number, ExpressionRef>;
};

function parseTerm(ctx: ParseCtx): ExpressionRef | number | null {
  if (ctx.pos >= ctx.tokens.length) {
    return null;
  }
  const token = ctx.tokens[ctx.pos];

  if (token.type === "metric") {
    const tokenPos = ctx.pos;
    ctx.pos++;
    return ctx.leafRefs.get(tokenPos) ?? null;
  }

  if (token.type === "constant") {
    ctx.pos++;
    return token.value;
  }

  if (token.type === "open-paren") {
    ctx.pos++;
    const expr = parseExpressionWithContext(ctx);
    if (
      ctx.pos < ctx.tokens.length &&
      ctx.tokens[ctx.pos].type === "close-paren"
    ) {
      ctx.pos++;
    }
    return expr;
  }

  return null;
}

const PRECEDENCE: Record<MathOperator, number> = {
  "+": 1,
  "-": 1,
  "*": 2,
  "/": 2,
};

function isOperatorAtPrecedence(ctx: ParseCtx, level: number): boolean {
  if (ctx.pos >= ctx.tokens.length) {
    return false;
  }
  const token = ctx.tokens[ctx.pos];
  return token.type === "operator" && PRECEDENCE[token.op] === level;
}

function parseFactor(ctx: ParseCtx): ExpressionRef | number | null {
  let left = parseTerm(ctx);
  if (left == null) {
    return null;
  }

  while (isOperatorAtPrecedence(ctx, 2)) {
    const op = (ctx.tokens[ctx.pos] as { type: "operator"; op: MathOperator })
      .op;
    ctx.pos++;
    const right = parseTerm(ctx);
    if (right == null) {
      return null;
    }
    left = [op, {}, left, right];
  }

  return left;
}

function parseExpressionWithContext(ctx: ParseCtx): ExpressionRef | null {
  let left = parseFactor(ctx);
  if (left == null) {
    return null;
  }

  while (isOperatorAtPrecedence(ctx, 1)) {
    const op = (ctx.tokens[ctx.pos] as { type: "operator"; op: MathOperator })
      .op;
    ctx.pos++;
    const right = parseFactor(ctx);
    if (right == null) {
      return null;
    }
    left = [op, {}, left, right];
  }

  if (typeof left === "number") {
    return null;
  }

  return left;
}

export function parseExpression(
  tokens: ExpressionSubToken[],
  leafRefs: Map<number, ExpressionRef>,
): ExpressionRef | null {
  const ctx: ParseCtx = { tokens, pos: 0, leafRefs };
  const result = parseExpressionWithContext(ctx);
  if (ctx.pos < tokens.length) {
    return null;
  }
  return result;
}
