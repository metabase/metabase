import { quoteString, unquoteString } from "./string";
import { fuzz } from "./test/fuzz";
import { createRandom } from "./test/generator";

const MAX_SEED = 10_000;

const alphabet = [
  ..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789\n\r\t\f\b\v'\"_-()[]",
  "\\\\",
];

function randomString(seed: number): string {
  const random = createRandom(seed);

  const randomInt = (max: number): number => Math.floor(max * random());
  const randomChar = () => alphabet[randomInt(alphabet.length)];

  const len = randomInt(100);
  const res = [];
  for (let i = 0; i < len; i++) {
    res.push(randomChar());
  }
  return res.join("");
}

fuzz("metabase-lib/v1/expressions/string", () => {
  for (let seed = 0; seed <= MAX_SEED; seed++) {
    it(`should round trip strings (seed = ${seed})`, () => {
      const str = randomString(seed);
      const quoted = quoteString(str, "'");
      const unquoted = unquoteString(quoted);

      expect(unquoted).toEqual(str);
    });
  }
});
