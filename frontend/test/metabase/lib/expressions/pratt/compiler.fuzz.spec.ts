import { generateExpression } from "../generator";
import { compile, oracle } from "./common";

const TYPE = ["boolean", "number", "string", "expression"];

if (process.env.MB_FUZZ) {
  describe("FUZZ metabase/lib/expressions/compiler", () => {
    const MAX_SEED = 6e4;
    for (let seed = 1e4; seed < MAX_SEED; ++seed) {
      const type = TYPE[seed % 4];
      const { expression } = generateExpression(seed, type);
      let expected: any;
      try {
        expected = oracle(expression, type as any);
      } catch (err) {
        xit(`should handle generated expression from seed ${seed}: ${expression}`, () => {
          return;
        });
        continue;
      }
      it(`should handle generated expression from seed ${seed}: ${expression}`, () => {
        expect(compile(expression, type as any)).toEqual(expected);
      });
    }
  });
}
