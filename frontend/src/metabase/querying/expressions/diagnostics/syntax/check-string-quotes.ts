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
      error(
        token,
        t`This text is empty or incomplete. Put the text between double quotes, like "Done".`,
      );
    }

    const openQuote = text[0];
    if (openQuote === "'" || openQuote === '"') {
      if (quoteString(value, openQuote) !== text) {
        error(
          token,
          t`This text is missing its closing quote. Add a " at the end, like "Done".`,
        );
      }
    } else {
      error(
        { pos: token.start, len: 1 },
        t`This kind of quote can't be used here. Use straight double quotes, like "Done".`,
      );
    }
  }
}
