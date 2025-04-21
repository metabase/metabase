import { t } from "ttag";

import { DiagnosticError } from "../errors";
import { STRING, type Token } from "../pratt";
import { quoteString } from "../string";

export function checkStringQuotes({ tokens }: { tokens: Token[] }) {
  for (const token of tokens) {
    if (token.type !== STRING) {
      continue;
    }

    const { text, value } = token;
    if (typeof value !== "string") {
      throw new DiagnosticError(t`Missing string value`, token);
    }

    const openQuote = text[0];
    if (openQuote === "'" || openQuote === '"') {
      if (quoteString(value, openQuote) !== text) {
        throw new DiagnosticError(t`Missing closing string quote`, token);
      }
    } else {
      throw new DiagnosticError(t`Unsupported string quote`, {
        pos: token.pos,
        len: 1,
      });
    }
  }
}
