import { t } from "ttag";

import { DiagnosticError } from "../errors";
import { FIELD, type Token } from "../pratt";
import { quoteString } from "../string";

export function checkFieldQuotes({ tokens }: { tokens: Token[] }) {
  for (const token of tokens) {
    if (token.type !== FIELD) {
      continue;
    }

    const { text, value } = token;

    if (typeof value !== "string") {
      throw new DiagnosticError(t`Missing field value`, token);
    }

    if (value === "") {
      throw new DiagnosticError(t`Expected a field name`, token);
    }

    if (quoteString(value, "[") !== text) {
      if (text.startsWith("[")) {
        throw new DiagnosticError(t`Missing a closing bracket`, token);
      } else {
        throw new DiagnosticError(
          t`Missing an opening bracket for ${value}`,
          token,
        );
      }
    }
  }
}
