import { t } from "ttag";

import type { Token } from "../../pratt";
import { GROUP, GROUP_CLOSE } from "../../pratt";
import { error } from "../utils";

export function checkMatchingParentheses({ tokens }: { tokens: Token[] }) {
  let lastOpen = undefined;
  let count = 0;

  for (const token of tokens) {
    if (token.type === GROUP) {
      count += 1;
      lastOpen = token;
    }

    if (token.type === GROUP_CLOSE) {
      if (count === 0) {
        error(token, t`Expecting an opening parenthesis`);
      }
      count -= 1;
    }
  }

  if (count !== 0) {
    error(lastOpen, t`Expecting a closing parenthesis`);
  }
}
