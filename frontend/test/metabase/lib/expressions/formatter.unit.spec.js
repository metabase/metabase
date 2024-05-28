import { dataForFormatting } from "metabase-lib/v1/expressions/__support__/shared";
import { format } from "metabase-lib/v1/expressions/format";

describe("metabase-lib/v1/expressions/format", () => {
  describe.each(dataForFormatting)("%s", (_name, cases, opts) => {
    const tests = cases.filter(([, mbql]) => mbql != null);
    it.each(tests)(`should format %s`, (source, mbql) => {
      expect(format(mbql, opts)).toEqual(source);
    });
  });
});
