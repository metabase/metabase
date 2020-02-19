import { format } from "metabase/lib/expressions/formatter";

import { shared, aggregationOpts } from "./__support__/expressions";

describe("metabase/lib/expressions/formatter", () => {
  describe("format()", () => {
    for (const [name, cases, opts] of shared) {
      describe(name, () => {
        for (const [source, mbql, description] of cases) {
          it(`should format ${description}`, () => {
            expect(format(mbql, opts)).toEqual(source);
          });
        }
      });
    }

    // NOTE: only add tests below for things that don't fit the shared test cases above
  });
});
