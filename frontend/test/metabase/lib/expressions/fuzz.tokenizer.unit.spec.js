import _ from "underscore";

import { tokenize } from "metabase-lib/v1/expressions/tokenizer";

import { generateExpression } from "./generator";

const fuzz = process.env.MB_FUZZ ? describe : _.noop;

describe("metabase-lib/v1/expressions/tokenizer", () => {
  // quick sanity check before the real fuzzing
  it("should tokenize custom expresssion", () => {
    expect(() => tokenize("CASE([Deal],[Price]*7e-1,[Price]")).not.toThrow();
  });
});

fuzz("FUZZING metabase-lib/v1/expressions/tokenizer", () => {
  const MAX_SEED = 2e4;

  for (let seed = 0; seed < MAX_SEED; ++seed) {
    it("should handle generated expression from seed " + seed, () => {
      const { expression } = generateExpression(seed);
      expect(() => tokenize(expression)).not.toThrow();
    });
    it("should not error on generated expression from seed " + seed, () => {
      const { expression } = generateExpression(seed);
      expect(tokenize(expression).errors).toEqual([]);
    });
  }
});
