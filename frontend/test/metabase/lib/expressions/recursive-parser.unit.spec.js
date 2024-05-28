import { parse } from "metabase-lib/v1/expressions/recursive-parser";
import { resolve } from "metabase-lib/v1/expressions/resolver";

describe("metabase-lib/v1/expressions/recursive-parser", () => {
  const mockResolve = (kind, name) => [kind, name];
  const process = (source, type) =>
    resolve({ expression: parse(source), type, fn: mockResolve });
  const filter = expr => process(expr, "boolean");

  // handy references
  const X = ["segment", "X"];
  const Y = ["dimension", "Y"];
  const A = ["segment", "A"];
  const B = ["dimension", "B"];
  const C = ["dimension", "C"];

  it("should parse numeric literals", () => {
    expect(process("0")).toEqual(0);
    expect(process("42")).toEqual(42);
    expect(process("1.0")).toEqual(1);
    expect(process("0.123")).toEqual(0.123);
  });

  it("should parse string literals", () => {
    expect(process("'Universe'")).toEqual("Universe");
    expect(process('"answer"')).toEqual("answer");
  });

  it("should parse field references", () => {
    expect(process("[Rating]")).toEqual(["dimension", "Rating"]);
    expect(process("Discount")).toEqual(["dimension", "Discount"]);
  });

  it("should parse bracketed field references (with escaping)", () => {
    expect(process("[Sale \\[2022\\]]")).toEqual(["dimension", "Sale [2022]"]);
    expect(process("[Crazy\\test]")).toEqual(["dimension", "Crazy\\test"]);
  });

  it("should parse unary expressions", () => {
    expect(process("+6")).toEqual(["+", 6]);
    expect(process("++7")).toEqual(["+", ["+", 7]]);
    expect(process("-+8")).toEqual(["-", ["+", 8]]);
  });

  it("should parse binary expressions", () => {
    expect(process("14 * 3")).toEqual(["*", 14, 3]);
    expect(process("84 / 2")).toEqual(["/", 84, 2]);
    expect(process("5 + 37")).toEqual(["+", 5, 37]);
    expect(process("50 - 8")).toEqual(["-", 50, 8]);
  });

  it("should flatten binary expressions with more terms/factors", () => {
    expect(process("2 + 4 + 8")).toEqual(["+", 2, 4, 8]);
    expect(process("3 - 6 + 9")).toEqual(["+", ["-", 3, 6], 9]);
    expect(process("1 / 2 / 3")).toEqual(["/", 1, 2, 3]);
    expect(process("4 * 2 / 1")).toEqual(["/", ["*", 4, 2], 1]);
    expect(process("6 * 7 * 8")).toEqual(["*", 6, 7, 8]);
    expect(process("1/2*(3*4)")).toEqual(["*", ["/", 1, 2], ["*", 3, 4]]);
    expect(process("-1-(2-3)")).toEqual(["-", -1, ["-", 2, 3]]);
  });

  it("should flatten unary expressions", () => {
    expect(process("--5")).toEqual(5);
    expect(process("- 6")).toEqual(-6);
    expect(process("+-7")).toEqual(["+", -7]);
    expect(process("sqrt(-1)")).toEqual(["sqrt", -1]);
    expect(process("- X")).toEqual(["-", ["dimension", "X"]]);
  });

  it("should honor operator precedence", () => {
    expect(process("1 + 2 * 3")).toEqual(["+", 1, ["*", 2, 3]]);
    expect(process("1 + 2 + 3 * 4")).toEqual(["+", 1, 2, ["*", 3, 4]]);
  });

  it("should parse grouped expressions in parentheses", () => {
    expect(process("(1 + 2) * 3")).toEqual(["*", ["+", 1, 2], 3]);
    expect(process("4 / (5 - 6) * 7")).toEqual(["*", ["/", 4, ["-", 5, 6]], 7]);
    expect(process("7 * (8 + 9) - 1")).toEqual(["-", ["*", 7, ["+", 8, 9]], 1]);
  });

  it("should parse function calls", () => {
    expect(process("ceil(3.14)")).toEqual(["ceil", 3.14]);
    expect(process("log(1 + sqrt(9))")).toEqual(["log", ["+", 1, ["sqrt", 9]]]);
    expect(process("power(log(2.1), 7)")).toEqual(["power", ["log", 2.1], 7]);
    expect(process("trim(ID)")).toEqual(["trim", ["dimension", "ID"]]);
  });

  it("should handle CASE expression", () => {
    const def = { default: C };
    expect(process("CASE(X,Y)")).toEqual(["case", [[X, Y]]]);
    expect(process("CASE(X,Y,A,B)")).toEqual([
      "case",
      [
        [X, Y],
        [A, B],
      ],
    ]);
    expect(process("CASE(A,B,C)")).toEqual(["case", [[A, B]], def]);
    expect(process("CASE(A,B,C)")).toEqual(["case", [[A, B]], def]);
    expect(process("CASE(X,Y,A,B,C)")).toEqual([
      "case",
      [
        [X, Y],
        [A, B],
      ],
      def,
    ]);
  });

  it("should use MBQL canonical function names", () => {
    expect(process("regexextract(B,C)")).toEqual(["regex-match-first", B, C]);
  });

  it("should handle function options", () => {
    expect(filter("contains(B, C, 'case-insensitive')")).toEqual([
      "contains",
      B,
      C,
      { "case-sensitive": false },
    ]);
    expect(filter("interval(B, -1, 'days', 'include-current')")).toEqual([
      "time-interval",
      B,
      -1,
      "days",
      { "include-current": true },
    ]);
  });

  it("should use MBQL negative shorthands", () => {
    expect(filter("NOT IsNull(1)")).toEqual(["not-null", 1]);
    expect(filter("NOT IsEmpty(2 + 3)")).toEqual(["not-empty", ["+", 2, 3]]);
    expect(filter("NOT contains(B,C)")).toEqual(["does-not-contain", B, C]);
  });

  it("should parse booleans", () => {
    expect(process("Canceled = true")).toEqual([
      "=",
      ["dimension", "Canceled"],
      true,
    ]);
    expect(process("Canceled = True")).toEqual([
      "=",
      ["dimension", "Canceled"],
      true,
    ]);
    expect(process("Canceled = false")).toEqual([
      "=",
      ["dimension", "Canceled"],
      false,
    ]);
    expect(process("Canceled = False")).toEqual([
      "=",
      ["dimension", "Canceled"],
      false,
    ]);
  });

  it("should parse comparisons", () => {
    expect(process("round(3.14) = 3")).toEqual(["=", ["round", 3.14], 3]);
    expect(process("Tax != 0")).toEqual(["!=", ["dimension", "Tax"], 0]);
    expect(process("Rating <= 4")).toEqual(["<=", ["dimension", "Rating"], 4]);
    expect(process("[C] > -4")).toEqual([">", C, -4]);
  });

  it("should parse boolean unary expressions", () => {
    expect(process("NOT C > 0")).toEqual(["not", [">", C, 0]]);
    expect(process("NOT NOT X")).toEqual(["not", ["not", X]]);
  });

  it("should parse boolean binary expressions", () => {
    expect(process("X AND A")).toEqual(["and", X, A]);
    expect(process("A OR X")).toEqual(["or", A, X]);
  });

  it("should honor boolean precedence", () => {
    expect(process("NOT A OR X")).toEqual(["or", ["not", A], X]);
    expect(process("A and not X")).toEqual(["and", A, ["not", X]]);
  });

  it("should detect aggregation functions with no argument", () => {
    const mockResolve = (kind, name) => {
      if ("ABC".indexOf(name) >= 0) {
        return [kind, name];
      }
      throw new ReferenceError(`Unknown ["${kind}", "${name}"]`);
    };
    const type = "aggregation";
    const aggregation = expr =>
      resolve({ expression: parse(expr), type, fn: mockResolve });

    // sanity check first
    expect(aggregation("SUM(A)")).toEqual(["sum", ["dimension", "A"]]);
    expect(aggregation("Max(B)")).toEqual(["max", ["dimension", "B"]]);
    expect(aggregation("Average(C)")).toEqual(["avg", ["dimension", "C"]]);

    // functions without argument, hence no "()"
    expect(aggregation("Count")).toEqual(["count"]);
    expect(aggregation("CumulativeCount")).toEqual(["cum-count"]);

    // mixed them in some arithmetic
    expect(aggregation("COUNT/B")).toEqual(["/", ["count"], ["metric", "B"]]);
    expect(aggregation("1+CumulativeCount")).toEqual(["+", 1, ["cum-count"]]);
  });

  it("should handle aggregation with another function", () => {
    const type = "aggregation";
    const aggregation = expr =>
      resolve({ expression: parse(expr), type, fn: mockResolve });

    const A = ["dimension", "A"];
    const B = ["dimension", "B"];

    expect(aggregation("floor(Sum(A))")).toEqual(["floor", ["sum", A]]);
    expect(aggregation("round(Distinct(B)/2)")).toEqual([
      "round",
      ["/", ["distinct", B], 2],
    ]);
  });

  it("should prioritize existing metrics over functions", () => {
    const mockResolve = (kind, name) => {
      if (name === "Count" || "ABC".indexOf(name) >= 0) {
        return [kind, name];
      }
      throw new ReferenceError(`Unknown ["${kind}", "${name}"]`);
    };
    const type = "aggregation";
    const aggregation = expr =>
      resolve({ expression: parse(expr), type, fn: mockResolve });

    // sanity check first
    expect(aggregation("SUM(A)")).toEqual(["sum", ["dimension", "A"]]);
    expect(aggregation("Max(B)")).toEqual(["max", ["dimension", "B"]]);
    expect(aggregation("Average(C)")).toEqual(["avg", ["dimension", "C"]]);

    // Count is recognized as a metric instead of a function
    expect(aggregation("[Count]")).toEqual(["metric", "Count"]);
    expect(aggregation("[Count] + 7")).toEqual(["+", ["metric", "Count"], 7]);
  });

  it("should resolve segments", () => {
    expect(process("Expensive", "boolean")).toEqual(["segment", "Expensive"]);
    expect(process("NOT LowVolume")).toEqual(["not", ["segment", "LowVolume"]]);
  });

  it("should resolve dimensions", () => {
    expect(process("Rating")).toEqual(["dimension", "Rating"]);
    expect(process("Rating")).toEqual(["dimension", "Rating"]);
  });
});
