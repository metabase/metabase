import { t } from "ttag";

import { getMBQLName } from "metabase/lib/expressions";
import {
  countMatchingParentheses,
  TOKEN,
  OPERATOR as OP,
} from "metabase/lib/expressions/tokenizer";

export const getTokenizerErrors = (source, tokens, tokenizerErrors) => {
  getParenthesesErrors(tokens, tokenizerErrors);
  getFunctionErrors(source, tokens, tokenizerErrors);
};

const getParenthesesErrors = (tokens, tokenizerErrors) => {
  const mismatchedParentheses = countMatchingParentheses(tokens);

  const message =
    mismatchedParentheses === 1
      ? t`Expecting a closing parenthesis`
      : mismatchedParentheses > 1
      ? t`Expecting ${mismatchedParentheses} closing parentheses`
      : mismatchedParentheses === -1
      ? t`Expecting an opening parenthesis`
      : mismatchedParentheses < -1
      ? t`Expecting ${-mismatchedParentheses} opening parentheses`
      : null;

  if (message) {
    tokenizerErrors.push({
      message,
    });
  }
};

const getFunctionErrors = (source, tokens, tokenizerErrors) => {
  for (let i = 0; i < tokens.length - 1; ++i) {
    const token = tokens[i];

    if (token.type === TOKEN.Identifier && source[token.start] !== "[") {
      const functionName = source.slice(token.start, token.end);
      if (getMBQLName(functionName)) {
        const next = tokens[i + 1];
        if (next.op !== OP.OpenParenthesis) {
          tokenizerErrors.unshift({
            message: t`Expecting an opening parenthesis after function ${functionName}`,
          });
        }
      }
    }
  }
};
