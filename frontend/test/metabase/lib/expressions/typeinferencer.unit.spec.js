import { parse } from "metabase/lib/expressions/parser";
import { infer } from "metabase/lib/expressions/typeinferencer";

describe("metabase/lib/expressions/typeinferencer", () => {
  function parseAs(source, startRule) {
    let cst = null;
    try {
      const result = parse({ source, tokenVector: null, startRule });
      cst = result.cst;
    } catch (e) {}
    return cst;
  }

  // workaround the limitation of the parsing expecting a strict top-level grammar rule
  function tryParse(source) {
    let cst = parseAs(source, "expression");
    if (!cst) {
      cst = parseAs(source, "boolean");
    }
    return cst;
  }

  function type(expression) {
    return infer(tryParse(expression));
  }

  it("should infer the type of primitives", () => {
    expect(type("0")).toEqual("number");
    expect(type("1")).toEqual("number");
    expect(type("3.14159")).toEqual("number");
    expect(type('"Hola"')).toEqual("string");
    expect(type("'Bonjour!'")).toEqual("string");
  });

  it("should infer the result of arithmetic operations", () => {
    expect(type("[Price] + [Tax]")).toEqual("number");
    expect(type("1.15 * [Total]")).toEqual("number");
  });

  it("should infer the result of logical operations", () => {
    expect(type("NOT [Deal]")).toEqual("boolean");
    expect(type("[A] OR [B]")).toEqual("boolean");
    expect(type("[X] AND [Y]")).toEqual("boolean");
    expect(type("[Rating] < 3 AND [Price] > 100")).toEqual("boolean");
  });

  it("should infer parenthesized subexpression", () => {
    expect(type("(3.14159)")).toEqual("number");
    expect(type('((((("Hola")))))')).toEqual("string");
    expect(type("NOT ([Discount] > 0)")).toEqual("boolean");
  });

  it("should infer the result of CASE", () => {
    expect(type("CASE(X, 1, 2)")).toEqual("number");
    expect(type("CASE(Y, 'this', 'that')")).toEqual("string");
    expect(type("CASE(BigSale, Price>100, Price>200)")).toEqual("boolean");
  });
});
