import { t } from "ttag";

import { BAD_TOKEN, type Token } from "../../pratt";
import { error } from "../utils";

export function checkBadTokens({ tokens }: { tokens: Token[] }) {
  for (const token of tokens) {
    if (token.type !== BAD_TOKEN) {
      continue;
    }

    const { text } = token;
    if (text.length === 1) {
      error(token, t`Unexpected character: ${text}`);
    }

    error(token, t`Invalid expression: ${text}`);
  }
}
