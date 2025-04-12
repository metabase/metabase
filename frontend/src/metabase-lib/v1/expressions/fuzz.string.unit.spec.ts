import { quoteString, unquoteString } from "./string";
import { fuzz } from "./test/fuzz";
import { createRandom } from "./test/generator";

const MAX_SEED = 1000;

const simple = [
  ..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_(){}",
];

const special = ["\\n", "\\r", "\\f", "\\b", "\\t", "\\v"];

const alphabet = [
  ...simple,
  ...simple.map((char) => `\\${char}`).filter((str) => !special.includes(str)),
  ..."\n\r\t\f\b\v",
  ..."[]'\"`",
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

describe("metabase-lib/v1/expressions/compiler", () => {
  it("should parse a convoluted string with single quotes", () => {
    const str = alphabet.join("");

    const quoted = quoteString(str, "'");
    const unquoted = unquoteString(quoted);

    expect(unquoted).toEqual(str);
  });

  it("should parse a convoluted string with double quotes", () => {
    const str = alphabet.join("");

    const quoted = quoteString(str, '"');
    const unquoted = unquoteString(quoted);

    expect(unquoted).toEqual(str);
  });

  it("should parse a convoluted string with brackets", () => {
    const str = alphabet.join("");

    const quoted = quoteString(str, "[");
    const unquoted = unquoteString(quoted);

    expect(unquoted).toEqual(str);
  });
});

fuzz("metabase-lib/v1/expressions/string", () => {
  const QUOTES = ["'", '"', "["] as const;

  QUOTES.forEach((QUOTE) => {
    for (let seed = 0; seed <= MAX_SEED; seed++) {
      it(`should round trip strings through ${QUOTE} (seed=${seed})`, () => {
        const str = randomString(seed);
        const quoted = quoteString(str, QUOTE);
        const unquoted = unquoteString(quoted);

        expect(unquoted).toEqual(str);
      });
    }
  });
});
