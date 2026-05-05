import { t } from "ttag";

import {
  BAD_TOKEN,
  BOOLEAN,
  CALL,
  END_OF_INPUT,
  FIELD,
  GROUP,
  GROUP_CLOSE,
  IDENTIFIER,
  NUMBER,
  STRING,
  type Token,
} from "../../pratt";
import { error } from "../utils";

const left = [FIELD, STRING, NUMBER, BOOLEAN, IDENTIFIER, GROUP_CLOSE];
const right = [FIELD, STRING, NUMBER, BOOLEAN, IDENTIFIER, GROUP, CALL];

export function checkMismatchedSiblings({ tokens }: { tokens: Token[] }) {
  for (let index = 1; index < tokens.length; index++) {
    const token = tokens[index];
    const prevToken = tokens[index - 1];

    if (!token || !prevToken) {
      continue;
    }

    if (
      token.type === END_OF_INPUT ||
      token.type === BAD_TOKEN ||
      prevToken.type === BAD_TOKEN
    ) {
      continue;
    }

    if (left.includes(prevToken.type) && right.includes(token.type)) {
      error(token, t`Expecting operator but got ${token.text} instead`);
    }
  }
}
