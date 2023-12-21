import { format } from "metabase-lib/expressions/format";
import { dataForFormatting } from "metabase-lib/expressions/__support__/shared";

describe("metabase-lib/expressions/format", () => {
  describe.each(dataForFormatting)("%s", (_name, cases, opts) => {
    const tests = cases.filter(([, mbql]) => mbql != null);
    it.each(tests)(`should format %s`, (source, mbql) => {
      expect(format(mbql, opts)).toEqual(source);
    });
  });
});
