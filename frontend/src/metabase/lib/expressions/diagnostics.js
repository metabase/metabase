import { t } from "ttag";

import { tokenize, TOKEN, OPERATOR } from "metabase/lib/expressions/tokenizer";
import { getMBQLName } from "metabase/lib/expressions";
import { processSource } from "metabase/lib/expressions/process";

// e.g. "COUNTIF(([Total]-[Tax] <5" returns 2 (missing parentheses)
export function countMatchingParentheses(tokens) {
  const isOpen = t => t.op === OPERATOR.OpenParenthesis;
  const isClose = t => t.op === OPERATOR.CloseParenthesis;
  const count = (c, token) =>
    isOpen(token) ? c + 1 : isClose(token) ? c - 1 : c;
  return tokens.reduce(count, 0);
}

export function diagnose(source, startRule, query) {
  if (!source || source.length === 0) {
    return null;
  }

  const { tokens, errors } = tokenize(source);
  if (errors && errors.length > 0) {
    return errors[0];
  }

  for (let i = 0; i < tokens.length - 1; ++i) {
    const token = tokens[i];
    if (token.type === TOKEN.Identifier && source[token.start] !== "[") {
      const functionName = source.slice(token.start, token.end);
      if (getMBQLName(functionName)) {
        const next = tokens[i + 1];
        if (next.op !== OPERATOR.OpenParenthesis) {
          return {
            message: t`Expecting an opening parenthesis after function ${functionName}`,
          };
        }
      }
    }
  }

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
    return { message };
  }

  const { compileError } = processSource({ source, query, startRule });

  if (compileError) {
    return Array.isArray(compileError) && compileError.length > 0
      ? compileError[0]
      : compileError;
  }

  return null;
}
