import type { ExpressionRef } from "metabase-types/api";

import type { ExpressionSubToken } from "../types/viewer-state";

import { parseExpression } from "./parse-expression";
import { parseSourceId } from "./source-ids";

function createLeafRefs(
  tokens: ExpressionSubToken[],
): Map<number, ExpressionRef> {
  const leafRefs = new Map<number, ExpressionRef>();
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.type === "metric") {
      const uuid = `leaf-${i}`;
      const { id, type } = parseSourceId(token.sourceId);

      if (type === "metric") {
        leafRefs.set(i, ["metric", { "lib/uuid": uuid }, id]);
      } else if (type === "measure") {
        leafRefs.set(i, ["measure", { "lib/uuid": uuid }, id]);
      }
    }
  }
  return leafRefs;
}

// remove options to make comparisons easier
function stripOptions(expr: ExpressionRef | number | null): any {
  if (typeof expr === "number" || expr === null) {
    return expr;
  }
  if (expr[0] === "metric" || expr[0] === "measure") {
    return [expr[0], expr[2]];
  }
  return [expr[0], stripOptions(expr[2]), stripOptions(expr[3])];
}

describe("parseExpression", () => {
  it("should parse a simple expression", () => {
    const tokens: ExpressionSubToken[] = [
      { type: "metric", sourceId: "metric:1", count: 1 },
      { type: "operator", op: "+" },
      { type: "metric", sourceId: "metric:2", count: 1 },
    ];
    const expr = parseExpression(tokens, createLeafRefs(tokens));
    expect(stripOptions(expr)).toEqual(["+", ["metric", 1], ["metric", 2]]);
  });

  it("should handle parens", () => {
    const tokens: ExpressionSubToken[] = [
      { type: "metric", sourceId: "metric:1", count: 1 },
      { type: "operator", op: "-" },
      { type: "open-paren" },
      { type: "metric", sourceId: "metric:2", count: 1 },
      { type: "operator", op: "+" },
      { type: "metric", sourceId: "measure:3", count: 1 },
      { type: "close-paren" },
    ];
    const expr = parseExpression(tokens, createLeafRefs(tokens));
    expect(stripOptions(expr)).toEqual([
      "-",
      ["metric", 1],
      ["+", ["metric", 2], ["measure", 3]],
    ]);
  });

  it("should handle a single metric", () => {
    const tokens: ExpressionSubToken[] = [
      { type: "metric", sourceId: "metric:1", count: 1 },
    ];
    const expr = parseExpression(tokens, createLeafRefs(tokens));
    expect(stripOptions(expr)).toEqual(["metric", 1]);
  });

  it("should return null for invalid input", () => {
    const tokens: ExpressionSubToken[] = [
      { type: "metric", sourceId: "metric:1", count: 1 },
      { type: "operator", op: "+" },
    ];
    const expr = parseExpression(tokens, createLeafRefs(tokens));
    expect(expr).toBeNull();
  });

  // A + B * C  =>  A + (B * C)
  it("should respect precedence: + before *", () => {
    const tokens: ExpressionSubToken[] = [
      { type: "metric", sourceId: "metric:1", count: 1 },
      { type: "operator", op: "+" },
      { type: "metric", sourceId: "metric:2", count: 1 },
      { type: "operator", op: "*" },
      { type: "metric", sourceId: "metric:3", count: 1 },
    ];
    const expr = parseExpression(tokens, createLeafRefs(tokens));
    expect(stripOptions(expr)).toEqual([
      "+",
      ["metric", 1],
      ["*", ["metric", 2], ["metric", 3]],
    ]);
  });

  // A * B + C  =>  (A * B) + C
  it("should respect precedence: * before +", () => {
    const tokens: ExpressionSubToken[] = [
      { type: "metric", sourceId: "metric:1", count: 1 },
      { type: "operator", op: "*" },
      { type: "metric", sourceId: "metric:2", count: 1 },
      { type: "operator", op: "+" },
      { type: "metric", sourceId: "metric:3", count: 1 },
    ];
    const expr = parseExpression(tokens, createLeafRefs(tokens));
    expect(stripOptions(expr)).toEqual([
      "+",
      ["*", ["metric", 1], ["metric", 2]],
      ["metric", 3],
    ]);
  });

  // A - B / C  =>  A - (B / C)
  it("should respect precedence: - before /", () => {
    const tokens: ExpressionSubToken[] = [
      { type: "metric", sourceId: "metric:1", count: 1 },
      { type: "operator", op: "-" },
      { type: "metric", sourceId: "metric:2", count: 1 },
      { type: "operator", op: "/" },
      { type: "metric", sourceId: "metric:3", count: 1 },
    ];
    const expr = parseExpression(tokens, createLeafRefs(tokens));
    expect(stripOptions(expr)).toEqual([
      "-",
      ["metric", 1],
      ["/", ["metric", 2], ["metric", 3]],
    ]);
  });

  // A * B + C * D  =>  (A * B) + (C * D)
  it("should handle multiple high-precedence groups", () => {
    const tokens: ExpressionSubToken[] = [
      { type: "metric", sourceId: "metric:1", count: 1 },
      { type: "operator", op: "*" },
      { type: "metric", sourceId: "metric:2", count: 1 },
      { type: "operator", op: "+" },
      { type: "metric", sourceId: "metric:3", count: 1 },
      { type: "operator", op: "*" },
      { type: "metric", sourceId: "metric:4", count: 1 },
    ];
    const expr = parseExpression(tokens, createLeafRefs(tokens));
    expect(stripOptions(expr)).toEqual([
      "+",
      ["*", ["metric", 1], ["metric", 2]],
      ["*", ["metric", 3], ["metric", 4]],
    ]);
  });

  // (A + B) * C  =>  parens override precedence
  it("should allow parens to override precedence", () => {
    const tokens: ExpressionSubToken[] = [
      { type: "open-paren" },
      { type: "metric", sourceId: "metric:1", count: 1 },
      { type: "operator", op: "+" },
      { type: "metric", sourceId: "metric:2", count: 1 },
      { type: "close-paren" },
      { type: "operator", op: "*" },
      { type: "metric", sourceId: "metric:3", count: 1 },
    ];
    const expr = parseExpression(tokens, createLeafRefs(tokens));
    expect(stripOptions(expr)).toEqual([
      "*",
      ["+", ["metric", 1], ["metric", 2]],
      ["metric", 3],
    ]);
  });

  it("should handle constants in precedence expressions", () => {
    // A + 2 * B  =>  A + (2 * B)
    const tokens: ExpressionSubToken[] = [
      { type: "metric", sourceId: "metric:1", count: 1 },
      { type: "operator", op: "+" },
      { type: "constant", value: 2 },
      { type: "operator", op: "*" },
      { type: "metric", sourceId: "metric:2", count: 1 },
    ];
    const expr = parseExpression(tokens, createLeafRefs(tokens));
    expect(stripOptions(expr)).toEqual([
      "+",
      ["metric", 1],
      ["*", 2, ["metric", 2]],
    ]);
  });

  // 8 - 3 - 2  =>  (8 - 3) - 2 = 3, not 8 - (3 - 2) = 7
  it("should associate subtraction left-to-right", () => {
    const tokens: ExpressionSubToken[] = [
      { type: "constant", value: 8 },
      { type: "operator", op: "-" },
      { type: "metric", sourceId: "metric:1", count: 1 },
      { type: "operator", op: "-" },
      { type: "metric", sourceId: "metric:2", count: 1 },
    ];
    const expr = parseExpression(tokens, createLeafRefs(tokens));
    expect(stripOptions(expr)).toEqual([
      "-",
      ["-", 8, ["metric", 1]],
      ["metric", 2],
    ]);
  });

  // 8 / 4 / 2  =>  (8 / 4) / 2 = 1, not 8 / (4 / 2) = 4
  it("should associate division left-to-right", () => {
    const tokens: ExpressionSubToken[] = [
      { type: "constant", value: 8 },
      { type: "operator", op: "/" },
      { type: "metric", sourceId: "metric:1", count: 1 },
      { type: "operator", op: "/" },
      { type: "metric", sourceId: "metric:2", count: 1 },
    ];
    const expr = parseExpression(tokens, createLeafRefs(tokens));
    expect(stripOptions(expr)).toEqual([
      "/",
      ["/", 8, ["metric", 1]],
      ["metric", 2],
    ]);
  });

  it("should return null when tokens are not fully consumed", () => {
    // "Metric1 2" — two operands with no operator
    const tokens: ExpressionSubToken[] = [
      { type: "metric", sourceId: "metric:1", count: 1 },
      { type: "constant", value: 2 },
    ];
    const expr = parseExpression(tokens, createLeafRefs(tokens));
    expect(expr).toBeNull();
  });

  it("should return null for metric followed by another metric without operator", () => {
    const tokens: ExpressionSubToken[] = [
      { type: "metric", sourceId: "metric:1", count: 1 },
      { type: "metric", sourceId: "metric:2", count: 1 },
    ];
    const expr = parseExpression(tokens, createLeafRefs(tokens));
    expect(expr).toBeNull();
  });

  // 6 / 2 * 3  =>  (6 / 2) * 3 = 9, not 6 / (2 * 3) = 1
  it("should associate mixed * and / left-to-right", () => {
    const tokens: ExpressionSubToken[] = [
      { type: "constant", value: 6 },
      { type: "operator", op: "/" },
      { type: "metric", sourceId: "metric:1", count: 1 },
      { type: "operator", op: "*" },
      { type: "metric", sourceId: "metric:2", count: 1 },
    ];
    const expr = parseExpression(tokens, createLeafRefs(tokens));
    expect(stripOptions(expr)).toEqual([
      "*",
      ["/", 6, ["metric", 1]],
      ["metric", 2],
    ]);
  });
});
