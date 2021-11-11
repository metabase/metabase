import { parse } from "metabase/lib/expressions/parser";

import { generateExpression } from "./generator";

const fuzz = process.env.MB_FUZZ ? describe : describe.skip;

const handle = source => {
  const { cst } = parse({ source, tokenVector: null, startRule: "expression" });
  return cst;
};

describe("metabase/lib/expressions/parser", () => {
  // quick sanity check before the real fuzzing
  it("should parse custom expresssion", () => {
    expect(() => handle("CASE([Deal],[Price]*7e-1,[Price])")).not.toThrow();
  });
});

fuzz("FUZZING metabase/lib/expressions/parser", () => {
  for (let seed = 1; seed < 1e4; ++seed) {
    it("should parse generated expression from seed " + seed, () => {
      const { expression } = generateExpression(seed, "expression");
      expect(() => handle(expression)).not.toThrow();
    });
  }
});
