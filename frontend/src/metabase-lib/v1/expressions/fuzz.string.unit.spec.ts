import _ from "underscore";

import { quoteString, unquoteString } from "./string";

const fuzz = process.env.MB_FUZZ ? describe : _.noop;
const MAX_SEED = 10_000;

fuzz("metabase-lib/v1/expressions/string", () => {
  it("should round trip strings", () => {
    const alphabet = [
      ..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789\n\r\t\f\b\v'\"",
      "\\\\",
    ];

    for (let i = 0; i < MAX_SEED; i++) {
      const len = Math.floor(Math.random() * 50);
      let res = "";
      for (let i = 0; i < len; i++) {
        const index = Math.floor(Math.random() * alphabet.length);
        res += alphabet[index];
      }

      const quoted = quoteString(res, "'");
      const unquoted = unquoteString(quoted);

      expect(unquoted).toEqual(res);
    }
  });
});
