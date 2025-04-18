import { query } from "./__support__/shared";
import { compileExpression } from "./compiler";
import type { StartRule } from "./types";

describe("resolve", () => {
  function collect(source: string, startRule: StartRule = "expression") {
    const fields: string[] = [];
    const segments: string[] = [];
    const metrics: string[] = [];

    const stageIndex = -1;

    const res = compileExpression({
      source,
      startRule,
      query,
      stageIndex,
      resolver(kind: string, name: string) {
        switch (kind) {
          case "field":
            fields.push(name);
            break;
          case "segment":
            segments.push(name);
            break;
          case "metric":
            metrics.push(name);
            break;
        }
        return {
          operator: kind,
          options: {},
          args: [name],
        } as any;
      },
    });

    if (res.error) {
      throw res.error;
    }

    return {
      fields,
      segments,
      metrics,
      expression: res.expressionParts,
    };
  }

  const expression = (expr: string) => collect(expr, "expression");
  const filter = (expr: string) => collect(expr, "boolean");
  const aggregation = (expr: string) => collect(expr, "aggregation");

  describe("for filters", () => {
    it("should resolve segments correctly", () => {
      expect(filter(`[A]`).segments).toEqual(["A"]);
      expect(filter(`not [B]`).segments).toEqual(["B"]);
      expect(filter(`not not [C]`).segments).toEqual(["C"]);
      expect(filter(`[P] > 3`).segments).toEqual([]);
      expect(filter(`Q < 1 and [R]`).segments).toEqual(["R"]);
      expect(filter(`isNull([S])`).segments).toEqual([]);
      expect(filter(`notEmpty([S])`).segments).toEqual([]);
      expect(filter(`lower([A]) > "X"`).segments).toEqual([]);
      expect(filter(`sqrt([B]) < 1`).segments).toEqual([]);
      expect(filter(`contains([C], "SomeString")`).segments).toEqual([]);
      expect(filter(`doesNotContain([C], "somestring")`).segments).toEqual([]);
      expect(filter(`[P] or [Q] > 3`).segments).toEqual(["P"]);
    });

    it("should resolve fields correctly", () => {
      expect(filter(`[A]`).fields).toEqual([]);
      expect(filter(`not [B]`).fields).toEqual([]);
      expect(filter(`not not [C]`).fields).toEqual([]);
      expect(filter(`[P] > 3`).fields).toEqual(["P"]);
      expect(filter(`Q < 1 and [R]`).fields).toEqual(["Q"]);
      expect(filter(`isNull([S])`).fields).toEqual(["S"]);
      expect(filter(`notEmpty([S])`).fields).toEqual(["S"]);
      expect(filter(`lower([A]) > "X"`).fields).toEqual(["A"]);
      expect(filter(`sqrt([B]) < 1`).fields).toEqual(["B"]);
      expect(filter(`contains([C], "SomeString")`).fields).toEqual(["C"]);
      expect(filter(`[P] or [Q] > 3`).fields).toEqual(["Q"]);
      expect(filter(`contains([C], "somestring")`).fields).toEqual(["C"]);
      expect(filter(`doesNotContain([C], "somestring")`).fields).toEqual(["C"]);
    });

    it("should work on functions with optional flag", () => {
      expect(() =>
        filter(`interval([A], 3, "day", "include-current")`),
      ).not.toThrow();
    });
  });

  describe("for expressions (for custom columns)", () => {
    it("should resolve segments correctly", () => {
      expect(expression(`trim([A])`).segments).toEqual([]);
      expect(expression(`round([B])`).segments).toEqual([]);
      expect(expression(`concat([S])`).segments).toEqual([]);
      expect(expression(`concat([A], [B])`).segments).toEqual([]);
      expect(expression(`coalesce([P])`).segments).toEqual([]);
      expect(expression(`coalesce([P], [Q], [R])`).segments).toEqual([]);
      expect(expression(`notNull([A])`).segments).toEqual([]);
      expect(expression(`notEmpty([A])`).segments).toEqual([]);
    });

    it("should resolve fields correctly", () => {
      expect(expression(`trim([A])`).fields).toEqual([`A`]);
      expect(expression(`round([B])`).fields).toEqual(["B"]);
      expect(expression(`concat([S])`).fields).toEqual(["S"]);
      expect(expression(`concat([A], [B])`).fields).toEqual(["A", "B"]);
      expect(expression(`coalesce([P])`).fields).toEqual(["P"]);
      expect(expression(`coalesce([P], [Q], [R])`).fields).toEqual([
        "P",
        "Q",
        "R",
      ]);
      expect(expression(`in([A], [B], [C])`).fields).toEqual(["A", "B", "C"]);
      expect(expression(`text([A])`).fields).toEqual(["A"]);
      expect(expression(`integer([A])`).fields).toEqual(["A"]);
      expect(expression(`doesNotContain([A], "SomeString")`).fields).toEqual([
        "A",
      ]);
      expect(expression(`notNull([A])`).fields).toEqual(["A"]);
      expect(expression(`notEmpty([A])`).fields).toEqual(["A"]);
    });

    it("should allow nested datetime expressions", () => {
      expect(() => expression(`year(now)`)).not.toThrow();
    });

    describe("datetime functions", () => {
      it("should resolve unchained functions", () => {
        expect(() => expression(`week("2022-01-01")`)).not.toThrow();
        expect(() =>
          expression(`datetimeAdd("2022-01-01", 1, "month")`),
        ).not.toThrow();

        // TODO: Implementation should be fine-tuned so that these throw
        // as they are not really datetime
        expect(() => expression(`day([A])`)).not.toThrow();
        expect(() => expression(`day("a")`)).not.toThrow();
        expect(() => expression(`weekday([A])`)).not.toThrow();
        expect(() => expression(`weekday("a")`)).not.toThrow();
        expect(() => expression(`week([A])`)).not.toThrow();
        expect(() => expression(`week("a")`)).not.toThrow();
        expect(() => expression(`month([A])`)).not.toThrow();
        expect(() => expression(`month("a")`)).not.toThrow();
        expect(() => expression(`quarter([A])`)).not.toThrow();
        expect(() => expression(`quarter("a")`)).not.toThrow();
        expect(() => expression(`year([A])`)).not.toThrow();
        expect(() => expression(`year("a")`)).not.toThrow();
      });

      it("should resolve chained commmands", () => {
        expect(() =>
          expression(
            `datetimeSubtract(datetimeAdd("2022-01-01", 1, "month"), 2,"minute")`,
          ),
        ).not.toThrow();
      });

      it("should chain datetime functions onto functions of compatible types", () => {
        expect(() =>
          expression(
            `concat(datetimeAdd("2022-01-01", 1, "month"), "a string")`,
          ),
        ).not.toThrow();
      });
    });
  });

  describe("for aggregations", () => {
    it("should resolve fields correctly", () => {
      expect(aggregation(`[A]`).fields).toEqual([]);
      expect(aggregation(`CumulativeSum([B])`).fields).toEqual(["B"]);
      expect(aggregation(`5 - Average([C])`).fields).toEqual(["C"]);
      expect(aggregation(`Share([P] > 3)`).fields).toEqual(["P"]);
      expect(aggregation(`Max(4 * [Q])`).fields).toEqual(["Q"]);
      expect(aggregation(`[R] + Median([S])`).fields).toEqual(["S"]);
      expect(aggregation(`CountIf(notNull([A]))`).fields).toEqual(["A"]);
      expect(aggregation(`CountIf(notEmpty([A]))`).fields).toEqual(["A"]);
    });

    it("should resolve metrics correctly", () => {
      expect(aggregation(`[A]`).metrics).toEqual(["A"]);
      expect(aggregation(`CumulativeSum([B])`).metrics).toEqual([]);
      expect(aggregation(`5 - Average([C])`).metrics).toEqual([]);
      expect(aggregation(`Share([P] > 3)`).metrics).toEqual([]);
      expect(aggregation(`Max(4 * [Q])`).metrics).toEqual([]);
      expect(aggregation(`[R] + Median([S])`).metrics).toEqual(["R"]);
      expect(aggregation(`CountIf(notNull([A]))`).metrics).toEqual([]);
      expect(aggregation(`CountIf(notEmpty([A]))`).metrics).toEqual([]);
    });

    it("should accept PERCENTILE with two arguments", () => {
      expect(() => aggregation(`Percentile([A], 0.5)`)).not.toThrow();
    });

    it("should handle Distinct/Min/Max aggregating over non-numbers", () => {
      expect(() => aggregation(`Distinct(coalesce("F"))`)).not.toThrow();
      expect(() => aggregation(`Min(coalesce("F"))`)).not.toThrow();
      expect(() => aggregation(`Max(coalesce("F"))`)).not.toThrow();
    });
  });

  describe("for CASE expressions", () => {
    it("should handle CASE with two arguments", () => {
      expect(expression(`case([A], [B])`)).toEqual({
        fields: ["B"],
        segments: ["A"],
        metrics: [],
        expression: expect.any(Object),
      });
    });

    it("should handle CASE with three arguments", () => {
      expect(expression(`case([P], [Q], [R])`)).toEqual({
        fields: ["Q", "R"],
        segments: ["P"],
        metrics: [],
        expression: expect.any(Object),
      });
    });

    it("should handle CASE with four arguments", () => {
      expect(expression(`case([A], [B], [P], [Q])`)).toEqual({
        fields: ["B", "Q"],
        segments: ["A", "P"],
        metrics: [],
        expression: expect.any(Object),
      });
    });

    it("should handle CASE with five arguments", () => {
      expect(expression(`case([A], [B], [P], [Q], [R])`)).toEqual({
        fields: ["B", "Q", "R"],
        segments: ["A", "P"],
        metrics: [],
        expression: expect.any(Object),
      });
    });

    it("should handle CASE with two complex arguments", () => {
      expect(expression(`case([P] < 2, [Q])`)).toEqual({
        fields: ["P", "Q"],
        segments: [],
        metrics: [],
        expression: expect.any(Object),
      });
    });

    it("should handle nested CASE", () => {
      expect(expression(`case([P], [Q], case([A], [B]))`)).toEqual({
        fields: ["Q", "B"],
        segments: ["P", "A"],
        metrics: [],
        expression: expect.any(Object),
      });
    });

    it("should handle CASE inside COALESCE", () => {
      expect(expression(`coalesce(case([A], [B]))`)).toEqual({
        fields: ["B"],
        segments: ["A"],
        metrics: [],
        expression: expect.any(Object),
      });
    });

    it("should accept a CASE expression with complex arguments", () => {
      expect(() => expression(`case([X], 0.5 * [Y], [A] - [B])`)).not.toThrow();
    });

    it("should allow sum inside expression in aggregation", () => {
      expect(() => expression(`case(Sum([A] > 10), [B])`)).not.toThrow();
    });

    it("should accept IF as an alias for CASE", () => {
      expect(expression(`if([A], [B])`)).toEqual({
        fields: ["B"],
        segments: ["A"],
        metrics: [],
        expression: expect.any(Object),
      });
    });

    it("should not fail on literal 0", () => {
      expect(expression(`case([A], 0)`).expression).toEqual({
        operator: "case",
        options: {},
        args: [expect.any(Object), 0],
      });

      expect(expression(`case([A], 0, 0)`).expression).toEqual({
        operator: "case",
        options: {},
        args: [expect.any(Object), 0, 0],
      });
    });
  });

  it("should reject unknown function", () => {
    expect(() => expression(`foobar(42)`)).toThrow();
  });

  describe("coalesce", () => {
    it("should resolve coalesce correctly", () => {
      expect(expression(`coalesce([A])`)).toEqual({
        fields: ["A"],
        segments: [],
        metrics: [],
        expression: expect.any(Object),
      });
      expect(filter(`coalesce([A])`)).toEqual({
        fields: [],
        segments: ["A"],
        metrics: [],
        expression: expect.any(Object),
      });
      expect(aggregation(`coalesce([A])`)).toEqual({
        fields: [],
        segments: [],
        metrics: ["A"],
        expression: expect.any(Object),
      });
      expect(aggregation(`trim(coalesce([A]))`)).toEqual({
        fields: ["A"],
        segments: [],
        metrics: [],
        expression: expect.any(Object),
      });
    });

    it("should accept COALESCE for number", () => {
      expect(() => expression(`round(coalesce(0))`)).not.toThrow();
    });

    it("should accept COALESCE for string", () => {
      expect(() => expression(`trim(coalesce("B"))`)).not.toThrow();
    });

    it("should honor CONCAT's implicit casting", () => {
      expect(() => expression(`concat(coalesce("B"), 1)`)).not.toThrow();
    });
  });

  describe("comparison operators", () => {
    const operators = ["<", "<=", ">", ">="] as const;
    operators.forEach((operator) => {
      it(`should resolve both args to ${operator}`, () => {
        const source = `[A] ${operator} [B]`;
        expect(expression(source).fields).toEqual(["A", "B"]);
        expect(filter(source).fields).toEqual(["A", "B"]);
        expect(aggregation(source).fields).toEqual(["A", "B"]);
        expect(aggregation(`CountIf(${source})`).fields).toEqual(["A", "B"]);
      });
    });
  });

  describe("number operators", () => {
    const operators = ["+", "-", "*", "/"] as const;
    operators.forEach((operator) => {
      it(`should resolve all ${operator} args correctly`, () => {
        const source = `[A] ${operator} [B] ${operator} [C]`;
        expect(expression(source)).toEqual({
          fields: ["A", "B", "C"],
          segments: [],
          metrics: [],
          expression: expect.any(Object),
        });
        expect(filter(source)).toEqual({
          fields: ["A", "B", "C"],
          segments: [],
          metrics: [],
          expression: expect.any(Object),
        });
        expect(aggregation(source)).toEqual({
          fields: [],
          segments: [],
          metrics: ["A", "B", "C"],
          expression: expect.any(Object),
        });
      });
    });
  });

  describe("logic operators", () => {
    const operators = ["and", "or"] as const;
    operators.forEach((operator) => {
      it(`should resolve all args to ${operator} correctly`, () => {
        const source = `[A] ${operator} [B] ${operator} [C]`;
        expect(expression(source)).toEqual({
          fields: [],
          metrics: [],
          segments: ["A", "B", "C"],
          expression: expect.any(Object),
        });
        expect(filter(source)).toEqual({
          fields: [],
          metrics: [],
          segments: ["A", "B", "C"],
          expression: expect.any(Object),
        });
        expect(aggregation(source)).toEqual({
          fields: [],
          metrics: [],
          segments: ["A", "B", "C"],
          expression: expect.any(Object),
        });
      });
    });

    it("should resolve not args correctly", () => {
      const source = `not [A]`;
      expect(expression(source)).toEqual({
        fields: [],
        metrics: [],
        segments: ["A"],
        expression: expect.any(Object),
      });
      expect(filter(source)).toEqual({
        fields: [],
        metrics: [],
        segments: ["A"],
        expression: expect.any(Object),
      });
      expect(aggregation(source)).toEqual({
        fields: [],
        metrics: [],
        segments: ["A"],
        expression: expect.any(Object),
      });
    });
  });
});
