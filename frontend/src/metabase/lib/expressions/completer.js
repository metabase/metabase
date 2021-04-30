import { tokenize, TOKEN } from "./tokenizer";
import _ from "underscore";

// Given an expression, get the last identifier as the prefix match.
// Examples:
//  "Lower" returns "Lower"
//  "3 > [Rat" returns "[Rat"
//  "[Expensive] " returns null (because of the whitespace)
//  "IsNull([Tax])" returns null (last token is an operator)

export function partialMatch(expression) {
  const { tokens } = tokenize(expression);
  const lastToken = _.last(tokens);
  if (lastToken && lastToken.type === TOKEN.Identifier) {
    if (lastToken.end === expression.length) {
      return expression.slice(lastToken.start, lastToken.end);
    }
  }

  return null;
}
