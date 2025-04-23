import { t } from "ttag";

import type { Token } from "../../pratt";
import {
  CALL,
  FIELD,
  GROUP,
  GROUP_CLOSE,
  IDENTIFIER,
  OPERATORS,
} from "../../pratt";
import { error } from "../utils";

export function checkMissingCommasInArgumentList({
  tokens,
  source,
}: {
  tokens: Token[];
  source: string;
}) {
  const call = 1;
  const group = 2;
  const stack = [];

  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    const prevToken = tokens[index - 1];
    if (token?.type === GROUP) {
      if (!prevToken) {
        continue;
      }
      if (prevToken.type === CALL) {
        stack.push(call);
        continue;
      } else {
        stack.push(group);
        continue;
      }
    }
    if (token.type === GROUP_CLOSE) {
      stack.pop();
      continue;
    }

    const isCall = stack.at(-1) === call;
    if (!isCall) {
      continue;
    }

    const nextToken = tokens[index + 1];
    if (token.type === IDENTIFIER || token.type === FIELD) {
      if (nextToken && !OPERATORS.has(nextToken.type)) {
        const text = source.slice(nextToken.start, nextToken.end);
        error(nextToken, t`Expecting operator but got ${text} instead`);
      }
    }
  }
}
