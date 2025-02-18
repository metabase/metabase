import { dataForFormatting, query } from "./__support__/shared";
import { format } from "./format";

describe("format", () => {
  describe.each(dataForFormatting)("%s", (_name, cases, opts) => {
    const tests = cases.filter(([_res, mbql, _name]) => mbql != null);

    it.each(tests)(`should format %s`, (source: string, mbql: unknown) => {
      expect(format(mbql, { ...opts, query })).toEqual(source);
    });
  });
});
