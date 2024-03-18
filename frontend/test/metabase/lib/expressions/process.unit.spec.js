import { processSource } from "metabase-lib/v1/expressions/process";

describe("metabase-lib/v1/expressions/process", () => {
  describe("processSource", () => {
    it("should non throw", () => {
      expect(() =>
        processSource({ source: "1", targetOffset: null }),
      ).not.toThrow();
    });
    it("should handle valid input", () => {
      const { compileError } = processSource({
        source: "1",
        targetOffset: null,
      });
      expect(compileError).toBeUndefined();
    });
    it("should handle invalid input", () => {
      const { compileError } = processSource({
        source: "1+",
        targetOffset: null,
      });
      expect(compileError.toString()).toEqual("Error: Unexpected end of input");
    });
  });
});
