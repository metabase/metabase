import { parse, serialize } from "metabase/lib/expressions/syntax";

import { aggregationOpts, expressionOpts } from "./__support__/expressions";

describe("syntax parse()", () => {
  describe("source without whitespace", () => {
    for (const source of [
      "1",
      "-1",
      "1+2",
      "1+-2",
      "Sum(A)",
      "Sum(A*2)",
      "1-Sum(A*2)",
      '1-Sum(A*2+"Toucan Sam")',
      '1-Sum(A*2+"Toucan Sam")/Count()',
    ]) {
      it(`should parse and serialize '${source}'`, () => {
        const tree = parse(source, aggregationOpts);
        expect(serialize(tree)).toEqual(source);
      });
    }
  });
  describe("source with whitespace", () => {
    for (const source of [
      "Sum( A )",
      "Sum( A * 2)",
      "1 - Sum( A * 2 )",
      '1 - Sum( A * 2 + "Toucan Sam" )',
      '1 -  Sum( A * 2 + "Toucan Sam" ) / Count()',
    ]) {
      it(`should parse and serialize '${source}'`, () => {
        const tree = parse(source, aggregationOpts);
        expect(serialize(tree)).toEqual(source);
      });
    }
  });
  it(`should parse and serialize source with leading whitespace`, () => {
    const source = " Sum(A)";
    const tree = parse(source, aggregationOpts);
    expect(serialize(tree)).toEqual(source);
  });
  it(`should parse and serialize source with trailing whitespace`, () => {
    const source = "Sum(A) ";
    const tree = parse(source, aggregationOpts);
    expect(serialize(tree)).toEqual(source);
  });
  describe("recovery = true", () => {
    it("should parse missing quote at the end", () => {
      const source = '1 + "Total';
      const tree = parse(source, {
        ...expressionOpts,
        recover: true,
      });
      expect(serialize(tree)).toEqual(source);
    });
    it("should parse missing paren at the end", () => {
      const source = "1 + (2 + 3)";
      const tree = parse(source, {
        ...expressionOpts,
        recover: true,
      });
      expect(serialize(tree)).toEqual(source);
    });
    xit("should parse missing quote in the middle", () => {
      const source = 'Sum("Total)';
      const tree = parse(source, {
        ...aggregationOpts,
        recover: true,
      });
      expect(serialize(tree)).toEqual(source);
    });
  });
  describe("recovery = false", () => {
    it("should not parse missing quote at the end", () => {
      const source = '1 + "Total';
      expect(() => {
        const tree = parse(source, {
          ...expressionOpts,
          recover: false,
        });
      }).toThrow();
    });
  });
});
