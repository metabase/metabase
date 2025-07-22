import { t } from "ttag";

import { FIELD, type Token } from "../../pratt";
import { quoteString } from "../../string";
import { error } from "../utils";

export function checkFieldQuotes({ tokens }: { tokens: Token[] }) {
  for (const token of tokens) {
    if (token.type !== FIELD) {
      continue;
    }

    const { text, value } = token;

    if (typeof value !== "string") {
      error(token, t`Missing field value`);
    }

    if (value === "") {
      error(token, t`Expected a field name`);
    }

    if (quoteString(value, "[") !== text) {
      if (text.startsWith("[")) {
        error(token, t`Missing a closing bracket`);
      } else {
        error(token, t`Missing an opening bracket for ${value}`);
      }
    }
  }
}
