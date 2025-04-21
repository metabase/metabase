import { t } from "ttag";

import { DiagnosticError } from "../errors";
import { BAD_TOKEN, type Token } from "../pratt";

export function checkBadTokens({ tokens }: { tokens: Token[] }) {
  for (const token of tokens) {
    if (token.type !== BAD_TOKEN) {
      continue;
    }

    const { text } = token;
    if (text.length === 1) {
      throw new DiagnosticError(t`Invalid character: ${text}`, token);
    }

    throw new DiagnosticError(t`Invalid expression: ${text}`, token);
  }
}
