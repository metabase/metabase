import _ from "underscore";

import { tokenize, TOKEN, OPERATOR as OP } from "./tokenizer";

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

// Given an expression, find the inner-most function name.
// Examples:
//  "Concat([FirstName]," returns "Concat"
//  "Concat([Category], Lower([Type]" returns "Lower"
//  "X() + Concat(Type,Upper(Vendor),Y()" return "Concat"
//  "[Tax] / 3" returns null (not a function call)

export function enclosingFunction(expression) {
  const { tokens } = tokenize(expression);

  const isOpen = t => t.op === OP.OpenParenthesis;
  const isClose = t => t.op === OP.CloseParenthesis;

  let parenCount = 0;
  for (let i = tokens.length - 1; i > 0; --i) {
    const token = tokens[i];
    if (isClose(token)) {
      --parenCount;
    } else if (isOpen(token)) {
      ++parenCount;
      if (parenCount === 1) {
        const prev = tokens[i - 1];
        if (prev.type === TOKEN.Identifier) {
          return expression.slice(prev.start, prev.end);
        }
      }
    }
  }

  return null;
}
