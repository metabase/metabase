import {
  defaultParser,
  fallbackParser,
  recoveryParser,
  serialize,
} from "metabase/lib/expressions/syntax";

import { shared, aggregationOpts } from "./__support__/expressions";

const partialInputCases = {
  expression: [
    ['1 + "Total', "missing quote at the end"],
    ["1 +", "ending in +"],
    ["1 + (", "ending in open paren"],
    ["1 + (2", "ending in number"],
    ["1 + (2 + 3", "missing paren at the end"],
    ["1 (2 + 3)", "missing operator in the middle"],
  ],
  aggregation: [
    ["Sum", "aggregation without arguments"],
    ["Sum(", "aggregation with open paren"],
  ],
  filter: [],
};

describe("metabase/lib/expressions/syntax", () => {
  for (const parser of [defaultParser, recoveryParser, fallbackParser]) {
    describe(`${parser.name}()`, () => {
      for (const [name, cases, opts] of shared) {
        describe(name, () => {
          for (const [source, mbql, description] of cases) {
            if (mbql) {
              it(`should parse ${description}`, () => {
                const tree = parser({ source, ...opts });
                expect(serialize(tree)).toEqual(source);
              });
            }
          }
          // defaultParser doesn't support partial input
          if (parser !== defaultParser) {
            describe("with partial inputs", () => {
              for (const [source, description] of partialInputCases[name]) {
                it(`should parse ${description}`, () => {
                  const tree = parser({ source, ...opts });
                  expect(serialize(tree)).toEqual(source);
                });
              }
            });
          }
        });
      }

      // NOTE: only add tests below for things that don't fit the shared test cases above

      it(`should parse and serialize source with leading whitespace`, () => {
        const source = " Sum(A)";
        const tree = parser({ source, ...aggregationOpts });
        expect(serialize(tree)).toEqual(source);
      });

      it(`should parse and serialize source with trailing whitespace`, () => {
        const source = "Sum(A) ";
        const tree = parser({ source, ...aggregationOpts });
        expect(serialize(tree)).toEqual(source);
      });
    });
  }
});
