import { t } from "ttag";

import { STRING, type Token } from "../../pratt";
import { quoteString } from "../../string";
import { error } from "../utils";

export function checkStringQuotes({ tokens }: { tokens: Token[] }) {
  for (const token of tokens) {
    if (token.type !== STRING) {
      continue;
    }

    const { text, value } = token;
    if (typeof value !== "string") {
      error(token, t`Missing string value`);
    }

    const openQuote = text[0];
    if (openQuote === "'" || openQuote === '"') {
      if (quoteString(value, openQuote) !== text) {
        error(token, t`Missing closing string quote`);
      }
    } else {
      error({ pos: token.pos, len: 1 }, t`Unsupported string quote`);
    }
  }
}
