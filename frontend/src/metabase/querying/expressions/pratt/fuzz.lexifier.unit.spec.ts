import { lexify } from "../pratt/lexifier";
import { fuzz } from "../test/fuzz";
import { generateExpression } from "../test/generator";

describe("metabase/querying/expressions/tokenizer", () => {
  // quick sanity check before the real fuzzing
  it("should tokenize custom expression", () => {
    expect(() => lexify("CASE([Deal],[Price]*7e-1,[Price]")).not.toThrow();
  });
});

fuzz("FUZZING metabas/querying/expressions/lexifier", () => {
  const MAX_SEED = 2e4;

  for (let seed = 0; seed < MAX_SEED; ++seed) {
    it("should handle generated expression from seed " + seed, () => {
      const { expression } = generateExpression(seed);
      expect(() => lexify(expression)).not.toThrow();
    });
  }
});
