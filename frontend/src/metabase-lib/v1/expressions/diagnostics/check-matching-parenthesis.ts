import { t } from "ttag";

import { DiagnosticError } from "../errors";
import type { Token } from "../pratt";
import { GROUP, GROUP_CLOSE } from "../pratt";

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
        throw new DiagnosticError(t`Expecting an opening parenthesis`, token);
      }
      count -= 1;
    }
  }

  if (count !== 0) {
    throw new DiagnosticError(t`Expecting a closing parenthesis`, lastOpen);
  }
}
