import {
  tokenize,
  TOKEN as T,
  OPERATOR as OP,
  countMatchingParentheses,
} from "metabase/lib/expressions/tokenizer";

describe("metabase/lib/expressions/tokenizer", () => {
  const types = expr => tokenize(expr).tokens.map(t => t.type);
  const ops = expr => tokenize(expr).tokens.map(t => t.op);
  const values = expr => tokenize(expr).tokens.map(t => t.value);
  const errors = expr => tokenize(expr).errors;

  it("should tokenize operators", () => {
    expect(ops("(")).toEqual([OP.OpenParenthesis]);
    expect(ops(")")).toEqual([OP.CloseParenthesis]);
    expect(ops(",")).toEqual([OP.Comma]);
    expect(ops("+ -")).toEqual([OP.Plus, OP.Minus]);
    expect(ops("/ *")).toEqual([OP.Slash, OP.Star]);
    expect(ops("= !=")).toEqual([OP.Equal, OP.NotEqual]);
    expect(ops("< >")).toEqual([OP.LessThan, OP.GreaterThan]);
    expect(ops("<=")).toEqual([OP.LessThanEqual]);
    expect(ops(">=")).toEqual([OP.GreaterThanEqual]);
    expect(ops("not NOT")).toEqual([OP.Not, OP.Not]);
    expect(ops("and And")).toEqual([OP.And, OP.And]);
    expect(ops("or oR")).toEqual([OP.Or, OP.Or]);
  });

  it("should not tokenize logical operators prematurely", () => {
    expect(types("notable")).toEqual([T.Identifier]);
    expect(types("ANDRA")).toEqual([T.Identifier]);
    expect(types("1+Oracle")).toEqual([T.Number, T.Operator, T.Identifier]);
  });

  it("should tokenize numeric literals", () => {
    expect(types("42")).toEqual([T.Number]);
    expect(types("0")).toEqual([T.Number]);
    expect(types("123456789")).toEqual([T.Number]);
    expect(types("3.14")).toEqual([T.Number]);
    expect(types("2.7182818284590452353602874")).toEqual([T.Number]);
    expect(types("6.022E+23")).toEqual([T.Number]);
    expect(types("6.626e-34")).toEqual([T.Number]);
    expect(types("299.792458e6")).toEqual([T.Number]);
    expect(types("9.e0")).toEqual([T.Number]);
  });

  it("should catch missing exponents", () => {
    expect(errors("2e")[0].message).toEqual("Missing exponent");
    expect(errors("3e+")[0].message).toEqual("Missing exponent");
    expect(errors("4E-")[0].message).toEqual("Missing exponent");
  });

  it("should tokenize string literals", () => {
    expect(types("'Hello'")).toEqual([T.String]);
    expect(types('"world"')).toEqual([T.String]);
  });

  it("should handle escaped sequences", () => {
    expect(values('"\\n"')[0].length).toEqual(1);
    expect(values('"\\r\\n"')[0].length).toEqual(2);
    expect(values('"say \\"Hi\\""')[0].length).toEqual(8);
    expect(values("'foo\\tbar'")[0].length).toEqual(7);
  });

  it("should catch unterminated string literals", () => {
    expect(errors("'single")[0].message).toEqual("Missing closing quotes");
    expect(errors('"double')[0].message).toEqual("Missing closing quotes");
  });

  it("should tokenize identifiers", () => {
    expect(types("Price")).toEqual([T.Identifier]);
    expect(types("Special_Deal")).toEqual([T.Identifier]);
    expect(types("Product.Rating")).toEqual([T.Identifier]);
    expect(types("_Category")).toEqual([T.Identifier]);
    expect(types("[Deal]")).toEqual([T.Identifier]);
    expect(types("[Review → Rating]")).toEqual([T.Identifier]);
    expect(types("[Product.Vendor]")).toEqual([T.Identifier]);
  });

  it("should catch unterminated bracket", () => {
    expect(errors("[T")[0].message).toEqual("Missing a closing bracket");
  });

  it("should catch new brackets within bracket identifiers", () => {
    expect(errors("[T[")[0].message).toEqual(
      "Bracket identifier in another bracket identifier",
    );
  });

  it("should catch a dangling closing bracket", () => {
    expect(errors("floor(Total]*1.25)")[0].message).toEqual(
      "Missing an opening bracket for Total",
    );
  });

  it("should allow escaping brackets within bracket identifiers", () => {
    expect(types("[T\\[]")).toEqual([T.Identifier]);
    expect(errors("[T\\[]")).toEqual([]);
  });

  it("should ignore whitespace", () => {
    expect(types("\n[Rating] ")).toEqual([T.Identifier]);
    expect(types("A\t  + ")).toEqual([T.Identifier, T.Operator]);
    expect(types("A \u3000  +\u2028")).toEqual([T.Identifier, T.Operator]);
    expect(errors("[Expensive]  ")).toEqual([]);
  });

  it("should tokenize simple comparisons", () => {
    expect(types("[Total] < 0")).toEqual([T.Identifier, T.Operator, T.Number]);
    expect(types("[Rate] >= 5")).toEqual([T.Identifier, T.Operator, T.Number]);
    expect(types("NOT [Deal]")).toEqual([T.Operator, T.Identifier]);
  });

  it("should tokenize simple arithmetics", () => {
    expect(types("[X]+[Y]")).toEqual([T.Identifier, T.Operator, T.Identifier]);
    expect(types("[P]/[Q]")).toEqual([T.Identifier, T.Operator, T.Identifier]);
  });

  it("should tokenize function calls", () => {
    expect(types("TODAY()")).toEqual([T.Identifier, T.Operator, T.Operator]);
    expect(types("AVG([Tax])")).toEqual([
      T.Identifier,
      T.Operator,
      T.Identifier,
      T.Operator,
    ]);
    expect(types("COUNTIF([Discount] < 5)")).toEqual([
      T.Identifier,
      T.Operator,
      T.Identifier,
      T.Operator,
      T.Number,
      T.Operator,
    ]);
  });

  it("should ignore garbage", () => {
    expect(types("!@^ [Deal]")).toEqual([T.Identifier]);
    expect(errors("!")[0].message).toEqual("Invalid character: !");
    expect(errors(" % @")[1].message).toEqual("Invalid character: @");
    expect(errors("    #")[0].pos).toEqual(4);
  });

  it("should count matching parentheses", () => {
    const count = expr => countMatchingParentheses(tokenize(expr).tokens);
    expect(count("()")).toEqual(0);
    expect(count("(")).toEqual(1);
    expect(count(")")).toEqual(-1);
    expect(count("(A+(")).toEqual(2);
    expect(count("SUMIF(")).toEqual(1);
    expect(count("COUNTIF(Deal))")).toEqual(-1);
  });
});
