import { format } from "metabase/lib/expressions/format";

import { shared } from "./__support__/expressions";

describe("metabase/lib/expressions/format", () => {
  describe("format()", () => {
    for (const [name, cases, opts] of shared) {
      describe(name, () => {
        for (const [source, mbql, description] of cases) {
          if (mbql) {
            it(`should format ${description}`, () => {
              expect(format(mbql, opts)).toEqual(source);
            });
          }
        }
      });
    }

    // NOTE: only add tests below for things that don't fit the shared test cases above
  });
});
