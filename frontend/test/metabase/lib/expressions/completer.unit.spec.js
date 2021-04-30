import { partialMatch } from "metabase/lib/expressions/completer";

describe("metabase/lib/expressions/completer", () => {
  describe("partialMatch", () => {
    it("should get the function name", () => {
      expect(partialMatch("Lowe")).toEqual("Lowe");
      expect(partialMatch("NOT (ISNULL")).toEqual("ISNULL");
    });

    it("should get the field name", () => {
      expect(partialMatch("[Deal]")).toEqual("[Deal]");
      expect(partialMatch("A")).toEqual("A");
      expect(partialMatch("B AND [Ca")).toEqual("[Ca");
      expect(partialMatch("[Sale] or [Good]")).toEqual("[Good]");
      expect(partialMatch("[")).toEqual("[");
    });

    it("should ignore operators and literals", () => {
      expect(partialMatch("X OR")).toEqual(null);
      expect(partialMatch("42 + ")).toEqual(null);
      expect(partialMatch("3.14")).toEqual(null);
      expect(partialMatch('"Hello')).toEqual(null);
      expect(partialMatch("'world")).toEqual(null);
    });

    it("should handle empty input", () => {
      expect(partialMatch("")).toEqual(null);
      expect(partialMatch(" ")).toEqual(null);
    });
  });
});
