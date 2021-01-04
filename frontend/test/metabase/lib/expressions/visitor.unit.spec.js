import { parse } from "metabase/lib/expressions/parser";
import { ExpressionVisitor } from "metabase/lib/expressions/visitor";

describe("ExpressionVisitor", () => {
  function parseSource(source, startRule) {
    let cst = null;
    try {
      cst = parse({ source, tokenVector: null, startRule }).cst;
    } catch (e) {
      let err = e;
      if (err.length && err.length > 0) {
        err = err[0];
        if (typeof err.message === "string") {
          err = err.message;
        }
      }
      throw err;
    }
    return cst;
  }
  function collect(source) {
    class LiteralCollector extends ExpressionVisitor {
      constructor() {
        super();
        this.literals = [];
      }
      stringLiteral(ctx) {
        this.literals.push(ctx.StringLiteral[0].image);
      }
      numberLiteral(ctx) {
        this.literals.push(ctx.NumberLiteral[0].image);
      }
    }
    const tree = parseSource(source, "boolean");
    const collector = new LiteralCollector();
    collector.visit(tree);
    return collector.literals;
  }
  it("should collect string literals", () => {
    expect(collect("contains([Vendor],'Super')")).toEqual(["'Super'"]);
  });
  it("should collect number literals", () => {
    expect(collect("between([Rating],3,5)")).toEqual(["3", "5"]);
  });
});
