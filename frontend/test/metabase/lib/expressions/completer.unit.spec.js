import {
  partialMatch,
  enclosingFunction,
} from "metabase/lib/expressions/completer";

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
      expect(partialMatch("42 +")).toEqual(null);
      expect(partialMatch("3.14")).toEqual(null);
      expect(partialMatch('"Hello')).toEqual(null);
      expect(partialMatch("'world")).toEqual(null);
    });

    it("should handle empty input", () => {
      expect(partialMatch("")).toEqual(null);
      expect(partialMatch(" ")).toEqual(null);
    });
  });

  describe("enclosingFunction", () => {
    it("should get the correct name", () => {
      expect(enclosingFunction("isnull([ID")).toEqual("isnull");
    });

    it("should ignore completed function construct", () => {
      expect(enclosingFunction("Upper([Name])")).toEqual(null);
    });

    it("should handle multiple arguments", () => {
      expect(enclosingFunction("Concat(First,Middle,Last")).toEqual("Concat");
    });

    it("should handle nested function calls", () => {
      expect(enclosingFunction("Concat(X,Lower(Y,Z")).toEqual("Lower");
      expect(enclosingFunction("P() + Q(R,S(7),T(")).toEqual("T");
      expect(enclosingFunction("P() + Q(R,S(7),T()")).toEqual("Q");
    });

    it("should ignore non-function calls", () => {
      expect(enclosingFunction("1")).toEqual(null);
      expect(enclosingFunction("2 +")).toEqual(null);
      expect(enclosingFunction("X OR")).toEqual(null);
    });

    it("should handle empty input", () => {
      expect(enclosingFunction("")).toEqual(null);
      expect(enclosingFunction(" ")).toEqual(null);
    });
  });
});
