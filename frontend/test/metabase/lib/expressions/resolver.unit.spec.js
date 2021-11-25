import { resolve } from "metabase/lib/expressions/resolver";

describe("metabase/lib/expressions/resolve", () => {
  function collect(expr, startRule = "expression") {
    const dimensions = [];
    const segments = [];
    const metrics = [];

    resolve(expr, startRule, (kind, name) => {
      switch (kind) {
        case "dimension":
          dimensions.push(name);
          break;
        case "segment":
          segments.push(name);
          break;
        case "metric":
          metrics.push(name);
          break;
      }
      return [kind, name];
    });

    return { dimensions, segments, metrics };
  }

  // handy references
  const A = ["dimension", "A"];
  const B = ["dimension", "B"];
  const C = ["dimension", "C"];
  const P = ["dimension", "P"];
  const Q = ["dimension", "Q"];
  const R = ["dimension", "R"];
  const S = ["dimension", "S"];

  describe("for filters", () => {
    const filter = e => collect(e, "boolean");

    it("should resolve segments correctly", () => {
      expect(filter(A).segments).toEqual(["A"]);
      expect(filter(["not", B]).segments).toEqual(["B"]);
      expect(filter(["not", ["not", C]]).segments).toEqual(["C"]);
      expect(filter([">", P, 3]).segments).toEqual([]);
      expect(filter(["and", ["<", Q, 1], R]).segments).toEqual(["R"]);
      expect(filter(["is-null", S]).segments).toEqual([]);
      expect(filter(["not-empty", S]).segments).toEqual([]);
      expect(filter(["lower", A]).segments).toEqual([]);
      expect(filter(["sqrt", B]).segments).toEqual([]);
      expect(filter(["contains", C, "SomeString"]).segments).toEqual([]);
      expect(filter(["or", P, [">", Q, 3]]).segments).toEqual(["P"]);
    });

    it("should resolve dimensions correctly", () => {
      expect(filter(A).dimensions).toEqual([]);
      expect(filter(["not", B]).dimensions).toEqual([]);
      expect(filter(["not", ["not", C]]).dimensions).toEqual([]);
      expect(filter([">", P, 3]).dimensions).toEqual(["P"]);
      expect(filter(["and", ["<", Q, 1], R]).dimensions).toEqual(["Q"]);
      expect(filter(["is-null", Q]).dimensions).toEqual(["Q"]);
      expect(filter(["not-empty", S]).dimensions).toEqual(["S"]);
      expect(filter(["lower", A]).dimensions).toEqual(["A"]);
      expect(filter(["sqrt", B]).dimensions).toEqual(["B"]);
      expect(filter(["contains", C, "SomeString"]).dimensions).toEqual(["C"]);
      expect(filter(["or", P, [">", Q, 3]]).dimensions).toEqual(["Q"]);
    });
  });

  describe("for expressions (for custom columns)", () => {
    const expr = e => collect(e, "expression");

    it("should resolve segments correctly", () => {
      expect(expr(["trim", A]).segments).toEqual([]);
      expect(expr(["round", B]).segments).toEqual([]);
      expect(expr(["concat", S]).segments).toEqual([]);
      expect(expr(["concat", A, B]).segments).toEqual([]);
      expect(expr(["coalesce", P]).segments).toEqual([]);
      expect(expr(["coalesce", P, Q, R]).segments).toEqual([]);
    });

    it("should resolve dimensions correctly", () => {
      expect(expr(["trim", A]).dimensions).toEqual(["A"]);
      expect(expr(["round", B]).dimensions).toEqual(["B"]);
      expect(expr(["concat", S]).dimensions).toEqual(["S"]);
      expect(expr(["concat", A, B]).dimensions).toEqual(["A", "B"]);
      expect(expr(["coalesce", P]).dimensions).toEqual(["P"]);
      expect(expr(["coalesce", P, Q, R]).dimensions).toEqual(["P", "Q", "R"]);
    });
  });

  describe("for aggregations", () => {
    const aggregation = e => collect(e, "aggregation");

    it("should resolve dimensions correctly", () => {
      expect(aggregation(A).dimensions).toEqual([]);
      expect(aggregation(["cum-sum", B]).dimensions).toEqual(["B"]);
      expect(aggregation(["-", 5, ["avg", C]]).dimensions).toEqual(["C"]);
      expect(aggregation(["share", [">", P, 3]]).dimensions).toEqual(["P"]);
      expect(aggregation(["max", ["*", 4, Q]]).dimensions).toEqual(["Q"]);
      expect(aggregation(["+", R, ["median", S]]).dimensions).toEqual(["S"]);
    });

    it("should resolve metrics correctly", () => {
      expect(aggregation(A).metrics).toEqual(["A"]);
      expect(aggregation(["cum-sum", B]).metrics).toEqual([]);
      expect(aggregation(["-", 5, ["avg", C]]).metrics).toEqual([]);
      expect(aggregation(["share", [">", P, 3]]).metrics).toEqual([]);
      expect(aggregation(["max", ["*", 4, Q]]).metrics).toEqual([]);
      expect(aggregation(["+", R, ["median", S]]).metrics).toEqual(["R"]);
    });
  });

  describe("for CASE expressions", () => {
    const expr = e => collect(e, "expression");
    it("should handle CASE with two arguments", () => {
      // CASE(A,B)
      expect(expr(["case", [[A, B]]]).segments).toEqual(["A"]);
      expect(expr(["case", [[A, B]]]).dimensions).toEqual(["B"]);
    });
    it("should handle CASE with three arguments", () => {
      // CASE(P, Q, R)
      const opt = { default: R };
      expect(expr(["case", [[P, Q]], opt]).segments).toEqual(["P"]);
      expect(expr(["case", [[P, Q]], opt]).dimensions).toEqual(["Q", "R"]);
    });
    it("should handle CASE with four arguments", () => {
      // CASE(A, B, P, Q)
      const ab = [A, B];
      const pq = [P, Q];
      expect(expr(["case", [ab, pq]]).segments).toEqual(["A", "P"]);
      expect(expr(["case", [ab, pq]]).dimensions).toEqual(["B", "Q"]);
    });
    it("should handle CASE with five arguments", () => {
      // CASE(A, B, P, Q, R)
      const ab = [A, B];
      const pq = [P, Q];
      const opt = { default: R };
      expect(expr(["case", [ab, pq], opt]).segments).toEqual(["A", "P"]);
      expect(expr(["case", [ab, pq], opt]).dimensions).toEqual(["B", "Q", "R"]);
    });
    it("should handle CASE with two complex arguments", () => {
      // CASE(P < 2, Q)
      expect(expr(["case", [[["<", P, 2], Q]]]).segments).toEqual([]);
      expect(expr(["case", [[["<", P, 2], Q]]]).dimensions).toEqual(["P", "Q"]);
    });
    it("should handle nested CASE", () => {
      // CASE(P, Q, CASE(A, B))
      const opt = { default: ["case", [[A, B]]] };
      expect(expr(["case", [[P, Q]], opt]).segments).toEqual(["P", "A"]);
      expect(expr(["case", [[P, Q]], opt]).dimensions).toEqual(["Q", "B"]);
    });
  });

  it("should handle unknown MBQL gracefully", () => {
    expect(() => collect(["abc-xyz", B])).not.toThrow();
  });
});
