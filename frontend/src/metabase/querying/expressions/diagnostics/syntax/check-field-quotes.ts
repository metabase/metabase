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
      error(
        token,
        t`This column name is empty. Put a column name between the brackets, like [Total].`,
      );
    }

    if (value === "") {
      error(
        token,
        t`This column name is empty. Put a column name between the brackets, like [Total].`,
      );
    }

    if (quoteString(value, "[") !== text) {
      if (text.startsWith("[")) {
        error(
          token,
          t`This column name is missing its closing bracket. Add a ] at the end, like [Total].`,
        );
      } else {
        error(
          token,
          t`"${value}" is missing its opening bracket. Write it as [${value}].`,
        );
      }
    }
  }
}
