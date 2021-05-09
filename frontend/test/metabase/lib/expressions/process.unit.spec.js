import { processSource } from "metabase/lib/expressions/process";

describe("metabase/lib/expressions/process", () => {
  describe("processSource", () => {
    it("should non throw", () => {
      expect(() =>
        processSource({ source: "1", targetOffset: null }),
      ).not.toThrow();
    });
    it("should handle valid input", () => {
      const { compileError, syntaxTree } = processSource({
        source: "1",
        targetOffset: null,
      });
      expect(compileError).toBeUndefined();
      expect(syntaxTree).toBeDefined();
      expect(syntaxTree.children).toBeDefined();
      expect(syntaxTree.children.length).toEqual(1);
    });
    it("should handle invalid input", () => {
      const { compileError } = processSource({
        source: "1+",
        targetOffset: null,
      });
      expect(compileError.toString()).toEqual(
        "NoViableAltException: Expected expression",
      );
    });
  });
});
