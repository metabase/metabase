import { format } from "metabase-lib/expressions/format";

import shared from "metabase-lib/expressions/__support__/shared";

describe("metabase-lib/expressions/format", () => {
  describe.each(shared)("%s", (name, cases, opts) => {
    const tests = cases.filter(([, mbql]) => mbql != null);
    it.each(tests)(`should format %s`, (source, mbql, description) => {
      expect(format(mbql, opts)).toEqual(source);
    });
  });
});
