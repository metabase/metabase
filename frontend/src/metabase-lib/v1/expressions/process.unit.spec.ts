import { createQuery } from "metabase-lib/test-helpers";

import { processSource } from "./process";

describe("process", () => {
  function setup({ expression }: { expression: string }) {
    const query = createQuery();
    const stageIndex = -1;
    return processSource({
      source: expression,
      query,
      stageIndex,
      startRule: "expression",
    });
  }

  describe("processSource", () => {
    it("should non throw", () => {
      const expression = "1";
      expect(() => setup({ expression })).not.toThrow();
    });

    it("should handle valid input", () => {
      const expression = "1";
      const { compileError } = setup({ expression });
      expect(compileError).toBeNull();
    });

    it("should handle invalid input", () => {
      const expression = "1+";
      const { compileError } = setup({ expression });
      expect(compileError?.message).toEqual("Unexpected end of input");
    });
  });
});
