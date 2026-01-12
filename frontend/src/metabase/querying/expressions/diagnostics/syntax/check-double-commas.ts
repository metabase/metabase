import { t } from "ttag";

import { COMMA, type Token } from "../../pratt";
import { error } from "../utils";

export function checkDoubleCommas({ tokens }: { tokens: Token[] }) {
  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i];
    const prevToken = tokens[i - 1];

    if (!token || !prevToken) {
      continue;
    }

    if (token.type === COMMA && prevToken.type === COMMA) {
      error(token, t`Expected expression but got: ,`);
    }
  }
}
