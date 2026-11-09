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
      error(
        token,
        t`The character ${text} can't be used here. Remove it, or put it inside quotes if it's part of some text.`,
      );
    }

    error(token, t`This part can't be read: ${text}. Check it for typos.`);
  }
}
