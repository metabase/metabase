import { t } from "ttag";

import { NUMBER, type Token } from "../../pratt";
import { error } from "../utils";

export function checkNumberExponent({ tokens }: { tokens: Token[] }) {
  for (const token of tokens) {
    if (token.type !== NUMBER) {
      continue;
    }

    const value = token.text.toLowerCase();
    const [, exponent, ...rest] = value.split("e");

    if (typeof exponent === "string" && !exponent.match(/[0-9]$/)) {
      error(
        token,
        t`This number has an "e" with nothing after it. Add a number, like 1e3, or remove the "e".`,
      );
    } else if (rest.length > 0) {
      // this should never occur with the current tokenizer
      error(
        token,
        t`This number has more than one "e". Use just one, like 1e3.`,
      );
    }
  }
}
