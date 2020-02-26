import {
  parse,
  defaultParser,
  fallbackParser,
  recoveryParser,
  serialize,
} from "metabase/lib/expressions/syntax";

import {
  shared,
  aggregationOpts,
  expressionOpts,
} from "./__support__/expressions";

describe("metabase/lib/expressions/syntax", () => {
  for (const parser of [defaultParser, fallbackParser]) {
    describe(`${parser.name}()`, () => {
      for (const [name, cases, opts] of shared) {
        describe(name, () => {
          for (const [source, mbql, description] of cases) {
            if (mbql) {
              it(`should parse ${description}`, () => {
                const tree = parser(source, opts);
                expect(serialize(tree)).toEqual(source);
              });
            }
          }
        });
      }

      // NOTE: only add tests below for things that don't fit the shared test cases above

      it(`should parse and serialize source with leading whitespace`, () => {
        const source = " Sum(A)";
        const tree = recoveryParser(source, aggregationOpts);
        expect(serialize(tree)).toEqual(source);
      });

      it(`should parse and serialize source with trailing whitespace`, () => {
        const source = "Sum(A) ";
        const tree = parse(source, aggregationOpts);
        expect(serialize(tree)).toEqual(source);
      });
    });
  }

  describe("recoveryParser()", () => {
    xit("should parse missing quote at the end", () => {
      const source = '1 + "Total';
      const tree = recoveryParser(source, expressionOpts);
      expect(serialize(tree)).toEqual(source);
    });
    it("should parse missing paren at the end", () => {
      const source = "1 + (2 + 3";
      const tree = recoveryParser(source, expressionOpts);
      expect(serialize(tree)).toEqual(source);
    });
    it("should parse missing operator in the middle", () => {
      const source = "1 2";
      const tree = recoveryParser(source, expressionOpts);
      expect(serialize(tree)).toEqual(source);
    });
    it("should with extra + in the middle", () => {
      const source = 'Sum("Total" +)';
      const tree = recoveryParser(source, aggregationOpts);
      expect(serialize(tree)).toEqual(source);
    });
  });

  fit("partial", () => {
    defaultParser("1 + (2 + (3 +", expressionOpts);
  });
});
